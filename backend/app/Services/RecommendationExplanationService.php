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
 * into clear, readable prose for a municipal officer. If this call
 * fails for any reason, the system should still work fine using the
 * structured facts directly — this is a presentation layer, not a
 * dependency for the actual decision-making.
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
     * ]
     */
    public function explain(array $facts): ?string
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
                ]
            );

            if (!$response->successful()) {
                Log::warning('Gemini API request failed', ['status' => $response->status(), 'body' => $response->body()]);
                return null;
            }

            return $response->json('candidates.0.content.parts.0.text');
        } catch (\Throwable $e) {
            // Network error, timeout, etc. — fail silently and let the
            // caller fall back to showing the structured facts directly.
            Log::error('Gemini explanation call threw an exception', ['message' => $e->getMessage()]);
            return null;
        }
    }

    private function buildPrompt(array $facts): string
    {
        return "You are writing a short, clear explanation for a municipal "
             . "agriculture officer reviewing a poultry farm's environmental "
             . "sensor data. Use only the facts given below — do not invent "
             . "additional numbers or claims. Do not change the diagnosis, "
             . "severity, or recommended action — only explain them in plain, "
             . "professional language, in 2-3 sentences.\n\n"
             . "Farm: {$facts['farm_name']}\n"
             . "Root cause: {$facts['root_cause']}\n"
             . "Trend data (JSON): " . json_encode($facts['trend']) . "\n"
             . "Recommended action: {$facts['recommended_action']}\n";
    }
}