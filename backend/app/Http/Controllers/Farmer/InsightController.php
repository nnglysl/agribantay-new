<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Services\FarmStatusService;
use App\Services\TrendAnalysisService;
use App\Services\RootCauseService;
use App\Services\PreventiveActionService;
use App\Services\RecommendationExplanationService;
use Illuminate\Http\Request;

/**
 * Farmer-facing view of the AI-Assisted Insight Layer — same four
 * services FarmController::rootCause() uses on the Admin side, but:
 *
 *  - Only ever resolves to a farm owned by the logged-in farm owner
 *    (optionally the one named by farm_id) — there's no way to access
 *    another owner's farm data through this endpoint.
 *  - Returns a simplified shape (root cause name, plain-language
 *    explanation, main action, plain tips) — no confidence percentages,
 *    no all_scores breakdown, no raw membership numbers. That level of
 *    detail is for Admin/Super Admin only.
 */
class InsightController extends Controller
{
    use ResolvesFarm;

    public function index(Request $request)
    {
        $farm = $this->resolveFarm($request);

        if (!$farm) {
            return response()->json([
                'success' => false,
                'message' => 'No farm found for this account.',
            ], 404);
        }

        // No active registered device means there is nothing real to
        // diagnose — skip straight to the "unavailable" response instead
        // of falling through to a stale SensorReading row left over from
        // before the device was removed/deactivated.
        if (!app(FarmStatusService::class)->hasActiveDevice($farm)) {
            return response()->json([
                'success' => true,
                'data' => [
                    'available' => false,
                    'message'   => 'No monitoring device registered for your farm yet.',
                ],
            ]);
        }

        // The WORST house, not the most recent one.
        //
        // This used to read a single farm-wide latest row. With two devices
        // reporting a minute apart that is whichever house happened to send
        // last — so a farm whose House 1 was Critical showed no advice at all
        // whenever House 2 (perfectly fine) reported more recently. The alert
        // cards are per house and the recommendations sit directly beneath
        // them, so they have to agree.
        $perDevice = Sensor::where('farm_id', $farm->id)
            ->where('status', 'Active')
            ->get()
            ->map(fn (Sensor $sensor) => SensorReading::where('sensor_id', $sensor->id)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->first())
            ->filter()
            ->sortByDesc(fn (SensorReading $r) => $this->severityOf($r))
            ->values();

        // Readings predating per-device attribution carry no sensor_id, so
        // fall back to the farm-wide row rather than showing nothing.
        $latestReading = $perDevice->first() ?? $farm->sensorReadings()->latest()->first();

        if (!$latestReading) {
            return response()->json([
                'success' => true,
                'data' => [
                    'available' => false,
                    'message'   => 'No sensor readings available yet for your farm.',
                ],
            ]);
        }

        $trend = app(TrendAnalysisService::class)->analyzeFarm($farm->id);

        $diagnosis = app(RootCauseService::class)->diagnose([
            'ammonia'     => $latestReading->ammonia,
            'temperature' => $latestReading->temperature,
            'humidity'    => $latestReading->humidity,
            'moisture'    => $latestReading->moisture,
        ], $trend);

        $preventiveActions = app(PreventiveActionService::class)->suggestActions(
            $diagnosis['memberships'],
            $diagnosis['root_cause']
        );

        $serviceSuggestions = app(PreventiveActionService::class)->suggestServiceRequests(
            $diagnosis['root_cause']
        );

        $tips = array_map(
            fn($a) => $a['suggestion'],
            $preventiveActions['sensor_actions']
        );

        // RootCauseService runs its own fuzzy membership functions over the
        // raw values; the *_status columns come from the researched RRL
        // thresholds in config/sensors.php. The two can disagree, and when
        // they do the farmer sees a red Critical banner next to "Normal
        // conditions ... no action needed" — which reads as permission to do
        // nothing about a Critical reading.
        //
        // The thresholds win. They are the figure cited in the study, and a
        // farmer acting on them is acting on the research. The diagnosis is
        // kept for naming the likely cause, but it is never allowed to
        // describe an out-of-range farm as normal.
        $breaches = $this->breachedMetrics($latestReading);

        if ($breaches) {
            $worst = collect($breaches)->contains(fn($b) => $b['status'] === 'Critical')
                ? 'Critical'
                : 'Warning';

            $named = collect($breaches)
                ->map(fn($b) => "{$b['label']} {$b['reading']} ({$b['status']})")
                ->implode(', ');

            if ($diagnosis['root_cause'] === 'Normal conditions') {
                $diagnosis['root_cause'] = $worst === 'Critical'
                    ? 'Readings outside the safe range'
                    : 'Readings drifting outside the safe range';
            }

            // Prepended rather than replacing the diagnosis text, so the
            // likely cause still reaches the farmer underneath the facts.
            $factual = $worst === 'Critical'
                ? "These readings are outside the safe range and need attention today: {$named}."
                : "These readings are drifting out of the safe range: {$named}.";

            $preventiveActions['overall_action'] = $factual;
        }

        // The only change in this file — farm_id lets
        // RecommendationExplanationService gate Gemini calls to once
        // per calendar day per farm (persisted in ai_recommendations),
        // instead of calling Gemini on every single request.
        $translated = app(RecommendationExplanationService::class)->explain([
            'farm_id'            => $farm->id,
            'farm_name'          => $farm->farm_name,
            'root_cause'         => $diagnosis['root_cause'],
            'trend'              => $trend,
            'recommended_action' => $preventiveActions['overall_action'],
            'tips'               => $tips,
        ]);

        // MUST stay after explain(): that call reassigns $translated wholesale,
        // so nulling these beforehand had no effect at all.
        //
        // Gemini's Filipino text is generated once per calendar day per farm
        // and persisted, so it reflects whatever the diagnosis was the FIRST
        // time the dashboard was opened today. When the RRL thresholds above
        // overrode that diagnosis, the stored Tagalog can still say the farm
        // is fine — and the farmer dashboard renders it in parentheses right
        // next to the English, directly contradicting it. Dropping it falls
        // the frontend back to English-only, which is far better than two
        // lines disagreeing about whether anything is wrong.
        if ($breaches) {
            $translated['main_action_fil'] = null;
            $translated['explanation_fil'] = null;
            // tips_fil is deliberately KEPT. Only overall_action is rewritten
            // above, so only its translation goes stale — $tips itself is
            // untouched by this block, and its Tagalog still matches. Nulling
            // it here left the farmer with English-only advice in exactly the
            // case where advice matters most, since a breach is what makes
            // the recommendations appear at all.
        }

        return response()->json([
            'success' => true,
            'data' => [
                'available'   => true,
                'root_cause'  => $diagnosis['root_cause'],

                // English (unchanged keys — existing frontend usage keeps working)
                'explanation' => $translated['explanation_en'] ?? null,
                'main_action' => $preventiveActions['overall_action'],
                'tips'        => $tips,

                // Filipino translations — null/omitted fields simply
                // mean Gemini didn't return them (e.g. API down), and
                // the frontend should fall back to English-only.
                'explanation_fil' => $translated['explanation_fil'] ?? null,
                'main_action_fil' => $translated['main_action_fil'] ?? null,
                'tips_fil'        => $translated['tips_fil'] ?? null,

                // Municipal services worth requesting given this
                // diagnosis — empty array when nothing applies (e.g.
                // "Normal conditions"). Each item's 'type' matches the
                // exact service_type value the farmer-side request form
                // submits, so the frontend can prefill it directly.
                'service_suggestions' => $serviceSuggestions,
            ],
        ]);
    }

    /**
     * Metrics whose researched threshold status is not Safe, with the value
     * that earned it. Returns [] when everything is in range, which is what
     * lets the caller leave a genuinely normal diagnosis alone.
     */
    /**
     * How bad a single reading is, as a sortable number.
     *
     * Only the alerting metrics count, the same rule FarmStatusService uses —
     * otherwise a 36 C house would outrank one that is actually Critical on
     * ammonia, and the farmer would be handed advice about the wrong problem.
     */
    private function severityOf(SensorReading $reading): int
    {
        $rank = ['Safe' => 0, 'Warning' => 1, 'Critical' => 2];
        $worst = 0;

        foreach (config('sensors.alerting_metrics', ['ammonia']) as $metric) {
            $worst = max($worst, $rank[$reading->{$metric . '_status'}] ?? 0);
        }

        return $worst;
    }

    private function breachedMetrics($reading): array
    {
        $metrics = [
            'ammonia'     => ['label' => 'Ammonia',     'unit' => ''],
            'temperature' => ['label' => 'Temperature', 'unit' => '°C'],
            'humidity'    => ['label' => 'Humidity',    'unit' => '%'],
            'moisture'    => ['label' => 'Manure moisture', 'unit' => '%'],
        ];

        $out = [];

        foreach ($metrics as $key => $meta) {
            $status = $reading->{$key . '_status'};
            $value  = $reading->$key;

            // A null value means the probe was faulty at ingestion; its
            // status was carried forward and says nothing about right now.
            if ($value === null || !in_array($status, ['Warning', 'Critical'], true)) {
                continue;
            }

            $out[] = [
                'metric'  => $key,
                'label'   => $meta['label'],
                'status'  => $status,
                'reading' => rtrim(rtrim(number_format((float) $value, 2, '.', ''), '0'), '.') . $meta['unit'],
            ];
        }

        return $out;
    }
}