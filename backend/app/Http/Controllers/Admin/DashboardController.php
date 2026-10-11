<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\User;
use App\Models\ServiceRequest;
use App\Models\Inspection;
use App\Models\SensorReading;
use App\Models\Sensor;
use App\Services\FarmStatusService;

class DashboardController extends Controller
{
    public function index()
    {
        $totalFarms        = Farm::count();
        $activeFarms       = Farm::where('status', 'Active')->count();
        $totalOwners       = User::where('role', 'farm_owner')->count();
        $totalVets         = User::where('role', 'vet')->count();
        $activeRequests    = ServiceRequest::whereIn('status', ['Pending', 'Scheduled'])->count();
        $resolvedRequests  = ServiceRequest::where('status', 'Completed')->count();

        $upcomingInspections = Inspection::with('farm')
            ->where('status', 'Scheduled')
            ->orderBy('scheduled_at')
            ->take(5)
            ->get()
            ->map(fn($i) => [
                'id'              => $i->id,
                'inspection_number' => $i->inspection_number,
                'farm_name'       => $i->farm->farm_name,
                'inspection_type' => $i->inspection_type,
                'scheduled_at'    => $i->scheduled_at,
                'status'          => $i->status,
            ]);

        $flyOdorTypes = ['Fly Control Request', 'Odor Control Request'];

        $flyOdorSummary = [
            'total'     => ServiceRequest::whereIn('service_type', $flyOdorTypes)->count(),
            'pending'   => ServiceRequest::whereIn('service_type', $flyOdorTypes)
                                ->whereIn('status', ['Pending', 'Scheduled'])->count(),
            'resolved'  => ServiceRequest::whereIn('service_type', $flyOdorTypes)
                                ->where('status', 'Completed')->count(),
            'fly_count'  => ServiceRequest::where('service_type', 'Fly Control Request')->count(),
            'odor_count' => ServiceRequest::where('service_type', 'Odor Control Request')->count(),
        ];

        // Current alerts require a reporting device and a recent reading from
        // its current farm. Historical statuses and incidents stay unchanged.
        $statusService = app(FarmStatusService::class);
        $alertingMetrics = config('sensors.alerting_metrics', ['ammonia']);
        $rank = ['Safe' => 0, 'Warning' => 1, 'Critical' => 2];
        $freshAfter = now()->subMinutes(config('sensors.offline_after_minutes', 3));
        $reportingDevices = fn ($query) => $query
            ->where('status', 'Active')
            ->where('last_seen_at', '>', $freshAfter);

        $criticalFarms = Farm::whereHas('sensors', $reportingDevices)
            ->with(['sensors' => $reportingDevices])
            ->get()
            ->map(function ($farm) use ($statusService, $alertingMetrics, $rank, $freshAfter) {
                // Check the device's latest row before checking its farm, so a
                // reassigned device cannot revive a reading from an earlier stay.
                $r = $farm->sensors
                    ->map(fn (Sensor $sensor) => SensorReading::where('sensor_id', $sensor->id)
                        ->orderByDesc('created_at')
                        ->orderByDesc('id')
                        ->first())
                    ->filter(fn ($reading) => $reading
                        && (int) $reading->farm_id === (int) $farm->id
                        && $reading->created_at->gt($freshAfter))
                    ->filter(fn (SensorReading $reading) => collect($alertingMetrics)->contains(
                        fn ($metric) => $reading->{$metric} !== null
                            && $reading->{$metric.'_status'} === 'Critical'
                    ))
                    ->sortByDesc(fn (SensorReading $reading) => $rank[$statusService->computeStatus($reading)] ?? 0)
                    ->first();

                if (!$r) return null;

                // All four values are still reported — temperature and humidity
                // are the conditions that drive ammonia, so they are useful
                // context next to it. What changed is that only an ALERTING
                // metric may be flagged critical. Humidity was being painted red
                // and counted, so a farm breaching ammonia and moisture reported
                // "3 Critical" and the panel contradicted the rule the rest of
                // the system follows.
                $metrics = [
                    ['type' => 'Ammonia',     'key' => 'ammonia',     'unit' => 'ppm'],
                    ['type' => 'Temperature', 'key' => 'temperature', 'unit' => '°C'],
                    ['type' => 'Humidity',    'key' => 'humidity',    'unit' => '%'],
                    ['type' => 'Moisture',    'key' => 'moisture',    'unit' => '%'],
                ];

                $allSensors = array_map(function ($m) use ($r, $alertingMetrics) {
                    $alerting = in_array($m['key'], $alertingMetrics, true);

                    return [
                        'type'     => $m['type'],
                        'value'    => $r->{$m['key']},
                        'unit'     => $m['unit'],
                        'advisory' => !$alerting,
                        'critical' => $alerting && $r->{$m['key']} !== null
                            && $r->{$m['key'].'_status'} === 'Critical',
                    ];
                }, $metrics);

                $criticalCount = count(array_filter($allSensors, fn($s) => $s['critical']));
                if ($criticalCount === 0) return null;

                return [
                    'farm_id'          => $farm->id,
                    'farm_name'        => $farm->farm_name,
                    'all_sensors'      => $allSensors,
                    'critical_count'   => $criticalCount,
                    'ammonia'          => $r->ammonia,
                    'ammonia_status'   => $r->ammonia_status,
                    'reading_at'       => $r->created_at?->toIso8601String(),
                ];
            })
            ->filter()
            ->values();
        $criticalAlerts = $criticalFarms->count();

        return response()->json([
            'success' => true,
            'data'    => [
                'total_farms'         => $totalFarms,
                'active_farms'        => $activeFarms,
                'total_owners'        => $totalOwners,
                'total_vets'          => $totalVets,
                'active_requests'     => $activeRequests,
                'resolved_requests'   => $resolvedRequests,
                'critical_alerts'     => $criticalAlerts,
                'fly_odor_summary'    => $flyOdorSummary,
                'upcoming_inspections'=> $upcomingInspections,
                'critical_farms'      => $criticalFarms,
            ],
        ]);
    }
}
