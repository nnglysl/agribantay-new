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
        $criticalAlerts    = SensorReading::where(function ($q) {
            $q->where('ammonia_status', 'Critical')
              ->orWhere('temperature_status', 'Critical')
              ->orWhere('humidity_status', 'Critical')
              ->orWhere('moisture_status', 'Critical');
        })->count();

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


        // Fly & Odor Control Overview — aggregated across all farms,
        // not per-farm detail. Reuses the same service_type values
        // ServiceRequestController already validates against.
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

        $criticalFarms = SensorReading::with('farm')
            ->where(function ($q) {
                $q->where('ammonia_status', 'Critical')
                  ->orWhere('temperature_status', 'Critical')
                  ->orWhere('humidity_status', 'Critical')
                  ->orWhere('moisture_status', 'Critical');
            })
            ->get()
            ->map(function ($r) {
                // All four readings, always — each tagged with whether
                // it's the one(s) actually driving this farm's Critical
                // status, so the UI can highlight just those.
                $allSensors = [
                    ['type' => 'Ammonia',     'value' => $r->ammonia,     'unit' => 'ppm', 'critical' => $r->ammonia_status === 'Critical'],
                    ['type' => 'Temperature', 'value' => $r->temperature, 'unit' => '°C',  'critical' => $r->temperature_status === 'Critical'],
                    ['type' => 'Humidity',    'value' => $r->humidity,    'unit' => '%',   'critical' => $r->humidity_status === 'Critical'],
                    ['type' => 'Moisture',    'value' => $r->moisture,    'unit' => '%',   'critical' => $r->moisture_status === 'Critical'],
                ];

                $criticalCount = count(array_filter($allSensors, fn($s) => $s['critical']));

                return [
                    'farm_id'          => $r->farm_id,
                    'farm_name'        => $r->farm->farm_name,
                    'all_sensors'      => $allSensors,
                    'critical_count'   => $criticalCount,
                    'ammonia'          => $r->ammonia,
                    'ammonia_status'   => $r->ammonia_status,
                ];
            });

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