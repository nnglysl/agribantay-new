<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Models\AiRecommendation;

/**
 * AI-Assisted Insight Layer, step 4: Recommendation Explanation.
 *
 * Generation is now once-per-calendar-day per farm, persisted in
 * ai_recommendations — NOT a rolling cache with a TTL. A farm gets at
 * most one Gemini call per day, regardless of how many times its
 * sensors report or how many times the dashboard is loaded, UNLESS
 * FarmStatusService flags it via markForRefresh() when the farm
 * transitions into Critical — that bypasses the daily gate exactly
 * once, for that one urgent regeneration.
 *
 * $facts MUST include 'farm_id' now — added by InsightController
 * alongside the existing keys (farm_name, root_cause, trend,
 * recommended_action, tips) it already builds before calling explain().
 */
class RecommendationExplanationService
{
    private string $apiKey;
    private string $model;

    public function __construct()
    {
        $this->apiKey = config('services.gemini.api_key');
        $this->model  = config('services.gemini.model', 'gemini-3.5-flash');
    }

    public function explain(array $facts): ?array
    {
        $farmId = $facts['farm_id'] ?? null;

        if (!$farmId) {
            // Can't gate per-farm without a farm_id — fail safe by calling
            // Gemini directly rather than silently caching nothing forever.
            Log::warning('RecommendationExplanationService::explain() called without farm_id — daily caching skipped for this call.');
            return $this->callGemini($facts);
        }

        $record = AiRecommendation::firstOrNew(['farm_id' => $farmId]);

        $isFresh = $record->exists
            && !$record->force_refresh
            && $record->generated_date?->isToday();

        if ($isFresh) {
            return [
                'explanation_en'  => $record->explanation_en,
                'explanation_fil' => $record->explanation_fil,
                'main_action_fil' => $record->main_action_fil,
                'tips_fil'        => $record->tips_fil,
            ];
        }

        $result = $this->callGemini($facts);

        if ($result) {
            $record->fill([
                'explanation_en'  => $result['explanation_en'],
                'explanation_fil' => $result['explanation_fil'],
                'main_action_fil' => $result['main_action_fil'],
                'tips_fil'        => $result['tips_fil'],
                'generated_date'  => now()->toDateString(),
                'force_refresh'   => false,
            ])->save();

            return $result;
        }

        // Gemini call failed (rate limit, bad model, network error, etc.)
        // — per spec, keep showing the last saved recommendation instead
        // of dropping to nothing, if one exists.
        if ($record->exists) {
            Log::warning("Gemini regeneration failed for farm {$farmId} — serving last saved recommendation instead.");
            return [
                'explanation_en'  => $record->explanation_en,
                'explanation_fil' => $record->explanation_fil,
                'main_action_fil' => $record->main_action_fil,
                'tips_fil'        => $record->tips_fil,
            ];
        }

        return null;
    }

    /**
     * Called by FarmStatusService the instant a farm's status transitions
     * INTO Critical. Doesn't call Gemini itself — just flags the row so
     * the NEXT /farmer/insights request (which already has fresh $facts
     * built from the current Critical reading) regenerates immediately
     * instead of waiting for tomorrow's daily cycle.
     */
    public function markForRefresh(int $farmId): void
    {
        AiRecommendation::updateOrCreate(
            ['farm_id' => $farmId],
            ['force_refresh' => true]
        );
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
                    ? ' — free-tier quota exhausted for this model today.'
                    : ($response->status() === 404
                        ? ' — model name is likely wrong/unavailable for this API key.'
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

            return $this->parseResponse($text);
        } catch (\Throwable $e) {
            Log::error('Gemini explanation call threw an exception', ['message' => $e->getMessage()]);
            return null;
        }
    }

    private function parseResponse(string $text): ?array
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