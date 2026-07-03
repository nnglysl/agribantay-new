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

    private function syncRecommendations(Farm $farm): void
    {
        $recentReadings = SensorReading::where('farm_id', $farm->id)
            ->latest()
            ->take(3)
            ->get();

        if ($recentReadings->isEmpty()) {
            return;
        }

        $latest = $recentReadings->first();

        $this->evaluate($farm, 'Ventilation Improvement', 'Priority',
            $this->isTrending($recentReadings, 'ammonia_status'),
            $latest->ammonia_status,
            "Ammonia levels are trending upward, currently at {$latest->ammonia}ppm across recent readings.",
            'Increase exhaust fan operation and check for blocked vents.',
            'Request a maintenance visit through Service Requests if levels persist.'
        );

        $this->evaluate($farm, 'Litter Management', 'Routine',
            $this->isTrending($recentReadings, 'moisture_status'),
            $latest->moisture_status,
            "Litter moisture has been elevated across recent readings, currently at {$latest->moisture}%.",
            'Turn and partially replace litter to reduce moisture buildup.',
            'Schedule a litter check before the next inspection visit.'
        );

        $this->evaluate($farm, 'Equipment Check', 'Scheduled',
            $this->isTrending($recentReadings, 'temperature_status'),
            $latest->temperature_status,
            "Temperature readings have been unstable, currently at {$latest->temperature}°C.",
            'Have the fan and cooling system inspected before the next heat period.',
            'Request a maintenance visit through the Service Requests tab.'
        );

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

    /**
     * Trend check: fires immediately if the latest reading is Critical.
     * For Warning, requires at least 2 of the last 3 readings to be Warning or Critical
     * to avoid false alarms from a single noisy reading.
     */
    private function isTrending($readings, string $field): bool
    {
        $latest = $readings->first();

        if ($latest->$field === 'Critical') {
            return true;
        }

        $flagged = $readings->filter(fn($r) => in_array($r->$field, ['Warning', 'Critical']))->count();
        return $flagged >= 2;
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