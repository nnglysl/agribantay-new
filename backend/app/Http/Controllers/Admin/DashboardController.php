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
        $activeRequests    = request()->user()?->role === 'super_admin'
            ? ServiceRequest::operational()->whereIn('status', ['Pending', 'Scheduled'])->count() : 0;
        $resolvedRequests  = request()->user()?->role === 'super_admin'
            ? ServiceRequest::operational()->where('status', 'Completed')->count() : 0;

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

        // Current alerts require a reporting device and a recent reading from
        // its current farm. Historical statuses and incidents stay unchanged.
        $statusService = app(FarmStatusService::class);
        $alertingMetrics = \App\Services\MonitoringAssessmentService::PRIMARY;
        $rank = ['Safe' => 0, 'Warning' => 1, 'Critical' => 2];
        $freshAfter = now()->subMinutes(config('sensors.offline_after_minutes', 3));
        $reportingDevices = fn ($query) => $query
            ->where('status', 'Active')
            ->where('last_seen_at', '>', $freshAfter);
        $includeMonitoringCount = request()->user()?->role === 'super_admin';
        $monitoredFarms = 0;

        $criticalFarms = Farm::whereHas('sensors', $reportingDevices)
            ->with(['sensors' => $reportingDevices])
            ->get()
            ->map(function ($farm) use ($statusService, $alertingMetrics, $rank, $includeMonitoringCount, &$monitoredFarms) {
                // A fresh row must belong to this farm AND this device visit.
                $readings = app(\App\Services\CurrentMonitoringService::class)->latestPerDevice($farm, true);
                // Reuse the current, assignment-scoped rows already needed for
                // alerts. Count each farm once when any device has valid primary
                // data, using the existing assessment policy (including partial
                // primary coverage). Coordinates and historical farm status do
                // not determine whether the farm is currently reporting.
                if ($includeMonitoringCount && $readings->contains(fn (SensorReading $reading) =>
                    app(\App\Services\MonitoringAssessmentService::class)->reading($reading)['severity'] !== null
                )) {
                    $monitoredFarms++;
                }
                $r = $readings
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
                    'monitoring_assessment' => app(\App\Services\MonitoringAssessmentService::class)->farm($farm),
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
                ...($includeMonitoringCount ? ['monitored_farms' => $monitoredFarms] : []),
                'cleanout_compliance' => app(\App\Services\MaintenanceStatusService::class)->summary(
                    Farm::where('status', 'Active')->with('qualifyingCleanouts')->get()
                ),
                'active_farms'        => $activeFarms,
                'total_owners'        => $totalOwners,
                'total_vets'          => $totalVets,
                'active_requests'     => $activeRequests,
                'resolved_requests'   => $resolvedRequests,
                'critical_alerts'     => $criticalAlerts,
                'upcoming_inspections'=> $upcomingInspections,
                'critical_farms'      => $criticalFarms,
            ],
        ]);
    }
}
