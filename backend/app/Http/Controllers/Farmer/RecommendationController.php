<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\SensorReading;
use App\Models\Recommendation;
use Illuminate\Support\Facades\Auth;

class RecommendationController extends Controller
{
    public function index()
    {
        $farm = Farm::where('user_id', Auth::id())->firstOrFail();

        $this->syncRecommendations($farm);

        $recommendations = Recommendation::where('farm_id', $farm->id)
            ->where('is_active', true)
            ->latest()
            ->get()
            ->map(fn($r) => [
                'title'              => $r->type,
                'badge'              => $r->priority,
                'root_cause'         => $r->root_cause,
                'preventive_action'  => $r->preventive_action,
                'next_step'          => $r->suggested_next_step,
            ]);

        return response()->json([
            'success' => true,
            'data' => $recommendations,
        ]);
    }

    /**
     * Only Community Alert remains here — Ventilation Improvement, Litter
     * Management, and Equipment Check were removed because they duplicated
     * content the AI-Assisted Insight Layer (/farmer/insights) already
     * covers, just worded differently. Community Alert has no equivalent
     * anywhere in that pipeline (it's single-farm only), so it's the one
     * genuinely distinct thing left for this system to track.
     */
    private function syncRecommendations(Farm $farm): void
    {
        $barangayIssue = SensorReading::whereHas('farm', function ($q) use ($farm) {
                $q->where('barangay', $farm->barangay)->where('id', '!=', $farm->id);
            })
            ->where('humidity_status', '!=', 'Normal')
            ->exists();

        $this->evaluate($farm, 'Community Alert', 'Regional',
            $barangayIssue,
            $barangayIssue ? 'Warning' : 'Normal',
            "Nearby farms in {$farm->barangay} reported similar humidity patterns this week.",
            'This may be linked to a regional weather pattern — monitor your readings closely.',
            'Compare your dashboard trend chart with the past 48 hours of data.'
        );
    }

    private function evaluate(Farm $farm, string $type, string $priority, bool $shouldBeActive, ?string $status, string $rootCause, string $preventiveAction, string $nextStep): void
    {
        $existing = Recommendation::where('farm_id', $farm->id)
            ->where('type', $type)
            ->where('is_active', true)
            ->first();

        if ($shouldBeActive) {
            if (!$existing) {
                Recommendation::create([
                    'farm_id'              => $farm->id,
                    'type'                 => $type,
                    'priority'             => $priority,
                    'root_cause'           => $rootCause,
                    'preventive_action'    => $preventiveAction,
                    'suggested_next_step'  => $nextStep,
                    'is_active'            => true,
                ]);
            }
        } else {
            if ($existing) {
                $existing->update(['is_active' => false]);
            }
        }
    }
}