<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

/**
 * AI-Assisted Insight Layer, step 4: Recommendation Explanation.
 *
 * Important boundary: this service NEVER decides severity, root cause,
 * or priority — those are already decided deterministically by
 * TrendAnalysisService and the Root Cause engine before this is ever
 * called. Gemini's only job here is turning an already-made decision
 * into clear, readable prose for a municipal officer (English) plus a
 * Filipino translation of that same prose — never a different
 * decision, just a different language.
 *
 * Free-tier Gemini quota is only 20 requests/day per model — far too
 * low to call on every dashboard poll (the frontend refetches insights
 * every 60s). Responses are cached per farm, keyed by the actual
 * diagnosis content, so Gemini is only called again when the root
 * cause or recommendation genuinely changes — not on every refresh of
 * an already-unchanged diagnosis.
 */
class RecommendationExplanationService
{
    private string $apiKey;
    private string $model;
    private int $cacheTtlSeconds;

    public function __construct()
    {
        $this->apiKey = config('services.gemini.api_key');
        // Confirmed working against your quota logs — do not change
        // without first checking GET /v1beta/models?key=... to see
        // what's actually available for this API key.
        $this->model = config('services.gemini.model', 'gemini-3.5-flash');
        // 6 hours: long enough to stay well under the 20/day free-tier
        // quota even with multiple farms/pollers, short enough that a
        // farm whose conditions actually change gets a fresh explanation
        // the same day.
        $this->cacheTtlSeconds = (int) config('services.gemini.cache_ttl', 21600);
    }

    public function explain(array $facts): ?array
    {
        $cacheKey = $this->buildCacheKey($facts);

        return Cache::remember($cacheKey, $this->cacheTtlSeconds, function () use ($facts) {
            return $this->callGemini($facts);
        });
    }

    /**
     * Cache key is derived from the actual diagnosis content (root cause +
     * recommended action + tips), not the farm ID alone — so two different
     * farms with the identical diagnosis share one Gemini call, and a farm
     * whose diagnosis changes gets a fresh call instead of serving a stale
     * cached explanation for a different situation.
     */
    private function buildCacheKey(array $facts): string
    {
        $signature = md5(json_encode([
            'root_cause'         => $facts['root_cause'] ?? null,
            'recommended_action' => $facts['recommended_action'] ?? null,
            'tips'               => $facts['tips'] ?? [],
        ]));

        return "gemini_explanation:{$signature}";
    }

    private function callGemini(array $facts): ?array
    {
        if (empty($this->apiKey)) {
            Log::warning('Gemini API key not configured — skipping explanation generation.');
            return null;
        }

        $prompt = $this->buildPrompt($facts);

        try {
            $response = Http::timeout(10)->withHeaders([
                'x-goog-api-key' => $this->apiKey,
                'Content-Type'   => 'application/json',
            ])->post(
                "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent",
                [
                    'contents' => [
                        ['parts' => [['text' => $prompt]]],
                    ],
                    'generationConfig' => [
                        'response_mime_type' => 'application/json',
                    ],
                ]
            );

            if (!$response->successful()) {
                $hint = $response->status() === 429
                    ? ' — free-tier quota exhausted for this model today. Either wait for reset, reduce call frequency further, or upgrade billing plan.'
                    : ($response->status() === 404
                        ? ' — model name is likely wrong/unavailable for this API key. Run GET https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY to see valid options.'
                        : '');

                Log::warning('Gemini API request failed' . $hint, [
                    'model'  => $this->model,
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                return null;
            }

            $text = $response->json('candidates.0.content.parts.0.text');

            if (!$text) {
                Log::warning('Gemini response had no text content', ['body' => $response->body()]);
                return null;
            }

            return $this->parseResponse($text, $facts);
        } catch (\Throwable $e) {
            Log::error('Gemini explanation call threw an exception', ['message' => $e->getMessage()]);
            return null;
        }
    }

    private function parseResponse(string $text, array $facts): ?array
    {
        $cleaned = trim($text);
        $cleaned = preg_replace('/^```(?:json)?\s*/', '', $cleaned);
        $cleaned = preg_replace('/\s*```$/', '', $cleaned);

        $decoded = json_decode($cleaned, true);

        if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
            Log::warning('Gemini response was not valid JSON', ['raw' => $text]);
            return null;
        }

        return [
            'explanation_en'  => $decoded['explanation_en'] ?? null,
            'explanation_fil' => $decoded['explanation_fil'] ?? null,
            'main_action_fil' => $decoded['main_action_fil'] ?? null,
            'tips_fil'        => is_array($decoded['tips_fil'] ?? null) ? $decoded['tips_fil'] : null,
        ];
    }

    private function buildPrompt(array $facts): string
    {
        $tipsJson = json_encode($facts['tips'] ?? []);

        return "You are writing a short, clear explanation for a municipal "
             . "agriculture officer reviewing a poultry farm's environmental "
             . "sensor data. Use only the facts given below — do not invent "
             . "additional numbers or claims. Do not change the diagnosis, "
             . "severity, or recommended action — only explain them in plain, "
             . "professional language, in 2-3 sentences. Then provide a "
             . "faithful Filipino (Tagalog) translation of that same "
             . "explanation, plus a Filipino translation of the recommended "
             . "action and each tip below. Do not change the meaning in "
             . "translation — translate only.\n\n"
             . "Farm: {$facts['farm_name']}\n"
             . "Root cause: {$facts['root_cause']}\n"
             . "Trend data (JSON): " . json_encode($facts['trend']) . "\n"
             . "Recommended action (English): {$facts['recommended_action']}\n"
             . "Tips (English, JSON array): {$tipsJson}\n\n"
             . "Respond ONLY with valid JSON in exactly this shape, no "
             . "markdown fences, no text outside the JSON:\n"
             . "{\n"
             . "  \"explanation_en\": \"...\",\n"
             . "  \"explanation_fil\": \"...\",\n"
             . "  \"main_action_fil\": \"...\",\n"
             . "  \"tips_fil\": [\"...\", \"...\"]\n"
             . "}\n";
    }
}