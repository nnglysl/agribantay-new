<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\User;
use App\Models\ServiceRequest;
use App\Models\Inspection;
use App\Models\SensorReading;

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
        $criticalFarms = Farm::where('current_status', 'Critical')
            ->get()
            ->map(function ($farm) {
                $r = SensorReading::where('farm_id', $farm->id)->latest()->first();

                if (!$r) return null;

                $allSensors = [
                    ['type' => 'Ammonia',     'value' => $r->ammonia,     'unit' => 'ppm', 'critical' => $r->ammonia_status === 'Critical'],
                    ['type' => 'Temperature', 'value' => $r->temperature, 'unit' => '°C',  'critical' => $r->temperature_status === 'Critical'],
                    ['type' => 'Humidity',    'value' => $r->humidity,    'unit' => '%',   'critical' => $r->humidity_status === 'Critical'],
                    ['type' => 'Moisture',    'value' => $r->moisture,    'unit' => '%',   'critical' => $r->moisture_status === 'Critical'],
                ];

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