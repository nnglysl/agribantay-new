<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * AI-Assisted Insight Layer, step 4: Recommendation Explanation.
 *
 * Important boundary: this service NEVER decides severity, root cause,
 * or priority — those are already decided deterministically by
 * TrendAnalysisService and the Root Cause engine before this is ever
 * called. Gemini's only job here is turning an already-made decision
 * into clear, readable prose for a municipal officer (English) plus a
 * Filipino translation of that same prose — never a different
 * decision, just a different language. If this call fails for any
 * reason, the system should still work fine using the structured
 * facts directly — this is a presentation layer, not a dependency for
 * the actual decision-making.
 */
class RecommendationExplanationService
{
    private string $apiKey;
    private string $model = 'gemini-3.5-flash';

    public function __construct()
    {
        $this->apiKey = config('services.gemini.api_key');
    }

    /**
     * $facts is a plain array of already-decided information — e.g.:
     * [
     *   'farm_name' => 'Dela Cruz Layer Farm',
     *   'root_cause' => 'Manure buildup',
     *   'trend' => [...output from TrendAnalysisService...],
     *   'recommended_action' => 'Increase manure removal frequency',
     *   'tips' => ['Clean out manure more often', 'Improve ventilation'],
     * ]
     *
     * Returns an array shaped like:
     * [
     *   'explanation_en'  => '...',
     *   'explanation_fil' => '...',
     *   'main_action_fil' => '...',
     *   'tips_fil'        => ['...', '...'],
     * ]
     * or null if the call fails / key is missing — callers should fall
     * back to showing the English structured facts only.
     */
    public function explain(array $facts): ?array
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
                Log::warning('Gemini API request failed', ['status' => $response->status(), 'body' => $response->body()]);
                return null;
            }

            $text = $response->json('candidates.0.content.parts.0.text');

            if (!$text) {
                Log::warning('Gemini response had no text content', ['body' => $response->body()]);
                return null;
            }

            return $this->parseResponse($text, $facts);
        } catch (\Throwable $e) {
            // Network error, timeout, etc. — fail silently and let the
            // caller fall back to showing the structured facts directly.
            Log::error('Gemini explanation call threw an exception', ['message' => $e->getMessage()]);
            return null;
        }
    }

    private function parseResponse(string $text, array $facts): ?array
    {
        // Gemini sometimes wraps JSON in markdown fences even when
        // response_mime_type is set — strip them defensively.
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