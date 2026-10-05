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

        // Fixed: previously counted every historical sensor_readings row
        // that was ever Critical, which never shrinks since readings are
        // append-only. Now counts farms currently in Critical status —
        // the same source of truth FarmMap.jsx already uses for pin
        // colors, so this number and the map agree.
        $criticalAlerts = Farm::where('current_status', 'Critical')->count();

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

        // Fixed: was querying SensorReading directly for any row that was
        // ever Critical (unbounded, append-only history — the source of
        // the duplicate "Hernan's Farm" rows and the map/sidebar
        // disagreement). Now starts from Farm.current_status — the exact
        // same field FarmMap.jsx reads for pin colors — so a farm can
        // only ever appear here if it's ACTUALLY Critical right now, and
        // it appears exactly once, using its single latest reading for
        // the per-sensor breakdown.
        // Which metrics may be called Critical. The same list farms.current_status
        // is derived from (FarmStatusService::computeStatus), so this panel can
        // never disagree with the status that put the farm in it.
        $statusService = app(FarmStatusService::class);
        $alertingMetrics = config('sensors.alerting_metrics', ['ammonia']);
        $rank = ['Safe' => 0, 'Warning' => 1, 'Critical' => 2];

        $criticalFarms = Farm::where('current_status', 'Critical')
            ->get()
            ->map(function ($farm) use ($statusService, $alertingMetrics, $rank) {
                // The reading shown has to be the one that made the farm
                // Critical. Taking the farm's single newest row instead meant
                // that on a multi-house farm the panel could describe a quiet
                // house while a different house was the one breaching — the
                // same per-device rule FarmStatusService uses, so the two
                // always point at the same reading.
                $r = Sensor::where('farm_id', $farm->id)
                    ->where('status', 'Active')
                    ->get()
                    ->map(fn (Sensor $sensor) => SensorReading::where('sensor_id', $sensor->id)
                        ->orderByDesc('created_at')
                        ->orderByDesc('id')
                        ->first())
                    ->filter()
                    ->sortByDesc(fn (SensorReading $reading) => $rank[$statusService->computeStatus($reading)] ?? 0)
                    ->first()
                    ?? SensorReading::where('farm_id', $farm->id)->latest()->first();

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
                        'critical' => $alerting && $r->{$m['key'].'_status'} === 'Critical',
                    ];
                }, $metrics);

                $criticalCount = count(array_filter($allSensors, fn($s) => $s['critical']));

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
            ->filter() // drops any null (farm marked Critical but has no readings yet — shouldn't happen, but defensive)
            ->values();

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