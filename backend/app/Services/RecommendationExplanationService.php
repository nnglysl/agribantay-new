<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use App\Models\AiRecommendation;
use Illuminate\Support\Facades\DB;

/**
 * AI-Assisted Insight Layer, step 4: Recommendation Explanation.
 *
 * Current endpoints capture a monitoring context and revision with their
 * inputs. Their daily cache is segregated by that identity and revalidated
 * before use and after generation. Saved legacy recommendation rows remain
 * intact. Unscoped legacy callers retain their existing persisted-cache path.
 * Both paths retain the existing per-farm retry cooldown.
 */
class RecommendationExplanationService
{
    /**
     * Seconds to wait before trying Gemini again for the same farm after a
     * failed or skipped call. Long enough for a free-tier rate window to
     * reset, short enough that a farm still catches up within the hour.
     */
    private const RETRY_COOLDOWN = 600;

    private string $apiKey;
    private string $model;

    public function __construct()
    {
        $this->apiKey = config('services.gemini.api_key');
        $this->model  = config('services.gemini.model', 'gemini-3.5-flash');
    }

    public function explain(array $facts): ?array
    {
        if (isset($facts['farm_id'], $facts['monitoring_context'])) {
            return $this->explainForAssignment($facts);
        }

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
                // When this text was actually written. A stored explanation
                // describes the farm as it was at generation time, and the
                // reader has no way to tell that from the wording alone —
                // "conditions are normal" reads identically whether it was
                // produced a minute ago or nine hours ago. Surfacing the
                // timestamp lets the screen say so instead of implying the
                // text is current.
                'generated_at'    => $record->updated_at?->toIso8601String(),
            ];
        }

        // One attempt per farm per RETRY_COOLDOWN, however many requests
        // arrive in between.
        //
        // force_refresh stays set until a call SUCCEEDS, so a farm flagged
        // for regeneration used to hit Gemini on every single request — the
        // farmer dashboard polls each minute, the Admin farm panel polls
        // alongside it, and each 429 left the flag up for the next one. The
        // retries were spending the very quota they were waiting on, so the
        // flag could never clear. Backing off lets the quota window recover.
        if (!Cache::add("gemini-attempt-{$farmId}", true, self::RETRY_COOLDOWN)) {
            return $record->exists ? [
                'explanation_en'  => $record->explanation_en,
                'explanation_fil' => $record->explanation_fil,
                'main_action_fil' => $record->main_action_fil,
                'tips_fil'        => $record->tips_fil,
            ] : null;
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

    private function explainForAssignment(array $facts): ?array
    {
        $farmId = (int) $facts['farm_id'];
        $monitoring = app(CurrentMonitoringService::class);
        $snapshot = [
            'context' => $facts['monitoring_context'],
            'revision' => $facts['monitoring_revision'] ?? $monitoring->revision($farmId),
        ];
        $key = 'gemini-assignment-'.$farmId.'-'.hash('sha256', json_encode($snapshot));
        $cached = $monitoring->withSnapshot($farmId, $snapshot, fn () => [
            'valid' => true, 'entry' => Cache::get($key),
        ]);
        if ($cached === null) {
            return null;
        }
        $entry = $cached['entry'];
        if ($entry && $entry['date'] === now()->toDateString()) {
            return $monitoring->withSnapshot($farmId, $snapshot, fn () => $entry['result']);
        }

        // Retain the existing per-farm retry limit. Never substitute a cache
        // from another assignment while waiting for its next allowed attempt.
        if (! Cache::add("gemini-attempt-{$farmId}", true, self::RETRY_COOLDOWN)) {
            return $monitoring->withSnapshot($farmId, $snapshot, fn () => $entry['result'] ?? null);
        }

        // No device/farm lock is held across this external request.
        $result = $this->callGemini($facts);
        if (! $result) {
            return $monitoring->withSnapshot($farmId, $snapshot, fn () => $entry['result'] ?? null);
        }

        return $monitoring->withSnapshot($farmId, $snapshot, function () use ($key, $result) {
            $result['generated_at'] = now()->toIso8601String();
            Cache::put($key, ['date' => now()->toDateString(), 'result' => $result], now()->addDays(2));

            // Scoped live explanations never overwrite the legacy persisted
            // recommendation row or any archived recommendation/report.
            return $result;
        });
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
        if (DB::transactionLevel() > 0) {
            DB::afterCommit(fn () => app(CurrentMonitoringService::class)->invalidateInsights($farmId));
        } else {
            app(CurrentMonitoringService::class)->invalidateInsights($farmId);
        }
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
