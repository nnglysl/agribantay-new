<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Services\TrendAnalysisService;
use App\Services\RootCauseService;
use App\Services\PreventiveActionService;
use App\Services\RecommendationExplanationService;
use Illuminate\Support\Facades\Auth;

/**
 * Farmer-facing view of the AI-Assisted Insight Layer — same four
 * services FarmController::rootCause() uses on the Admin side, but:
 *
 *  - Never takes a farm ID from the request — always resolves to the
 *    logged-in farm owner's own farm, so there's no way to access
 *    another farm's data through this endpoint.
 *  - Returns a simplified shape (root cause name, plain-language
 *    explanation, main action, plain tips) — no confidence percentages,
 *    no all_scores breakdown, no raw membership numbers. That level of
 *    detail is for Admin/Super Admin only.
 */
class InsightController extends Controller
{
    public function index()
    {
        // Matches the same "one farm per owner" assumption the rest of
        // the Farmer dashboard already makes. If farm owner accounts
        // are ever extended to properly support multiple farms, this
        // should be revisited alongside the dashboard/reports pages
        // that make the same assumption today.
        $farm = Farm::where('user_id', Auth::id())->first();

        if (!$farm) {
            return response()->json([
                'success' => false,
                'message' => 'No farm found for this account.',
            ], 404);
        }

        $latestReading = $farm->sensorReadings()->latest()->first();

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

        $explanation = app(RecommendationExplanationService::class)->explain([
            'farm_name'          => $farm->farm_name,
            'root_cause'         => $diagnosis['root_cause'],
            'trend'              => $trend,
            'recommended_action' => $preventiveActions['overall_action'],
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'available'   => true,
                'root_cause'  => $diagnosis['root_cause'],
                'explanation' => $explanation,
                'main_action' => $preventiveActions['overall_action'],
                // Plain suggestion text only — no severity percentages
                // shown to the farm owner, unlike the Admin view.
                'tips' => array_map(
                    fn($a) => $a['suggestion'],
                    $preventiveActions['sensor_actions']
                ),
                // Municipal services worth requesting given this
                // diagnosis — empty array when nothing applies (e.g.
                // "Normal conditions"). Each item's 'type' matches the
                // exact service_type value the farmer-side request form
                // submits, so the frontend can prefill it directly.
                'service_suggestions' => $serviceSuggestions,
            ],
        ]);
    }
}