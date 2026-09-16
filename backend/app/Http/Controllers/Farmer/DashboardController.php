<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Models\ServiceRequest;
use App\Models\SensorReading;
use App\Services\FarmStatusService;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    use ResolvesFarm;

    public function index(Request $request)
    {
        $farm = $this->resolveFarmOrFail($request);

        // A farm with no active registered device has no real data to
        // report at all — treat it exactly as if no reading exists, even
        // if a stale SensorReading row is still sitting in the table from
        // before the device was removed/deactivated.
        $hasActiveDevice = app(FarmStatusService::class)->hasActiveDevice($farm);

        $latestReading = $hasActiveDevice
            ? SensorReading::where('farm_id', $farm->id)->latest()->first()
            : null;

        // Simple derived health score — adjust formula if your capstone
        // spec defines a specific calculation.
        $healthScore = 100;
        foreach (['ammonia_status', 'temperature_status', 'humidity_status', 'moisture_status'] as $field) {
            $status = $latestReading?->$field;
            if ($status === 'Critical') {
                $healthScore -= 35;
            } elseif ($status === 'Warning') {
                $healthScore -= 10;
            }
        }
        $healthScore = max(0, min(100, $healthScore));

        $pendingRequests = ServiceRequest::where('farm_id', $farm->id)
            ->whereIn('status', ['Pending', 'Scheduled'])
            ->count();

        $nextScheduledVisit = ServiceRequest::where('farm_id', $farm->id)
            ->where('status', 'Scheduled')
            ->orderBy('scheduled_at')
            ->first();

        return response()->json([
            'success' => true,
            'data' => [
                'farm_id'               => $farm->id,
                'farm_name'             => $farm->farm_name,
                'barangay'              => $farm->barangay,
                'health_score'          => $healthScore,
                'health_status'         => !$hasActiveDevice || !$latestReading
                    ? 'Pending Setup'
                    : ($healthScore >= 70 ? 'Safe' : ($healthScore >= 40 ? 'Warning' : 'Critical')),
                'ammonia'               => $latestReading?->ammonia,
                'ammonia_status'        => $latestReading?->ammonia_status,
                'temperature'           => $latestReading?->temperature,
                'temperature_status'    => $latestReading?->temperature_status,
                'humidity'              => $latestReading?->humidity,
                'humidity_status'       => $latestReading?->humidity_status,
                'moisture'              => $latestReading?->moisture,
                'moisture_status'       => $latestReading?->moisture_status,
                'pending_requests'      => $pendingRequests,
                'next_scheduled_visit'  => $nextScheduledVisit ? [
                    'service_type' => $nextScheduledVisit->service_type,
                    'scheduled_at' => $nextScheduledVisit->scheduled_at,
                ] : null,
                'last_reading_at'       => $latestReading?->created_at,
                // Device communication state — never exposes the device key.
                'connectivity'          => app(FarmStatusService::class)->connectivity($farm),
            ],
        ]);
    }
}