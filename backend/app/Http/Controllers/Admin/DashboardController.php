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

        $criticalFarms = SensorReading::with('farm')
            ->where(function ($q) {
                $q->where('ammonia_status', 'Critical')
                  ->orWhere('temperature_status', 'Critical')
                  ->orWhere('humidity_status', 'Critical')
                  ->orWhere('moisture_status', 'Critical');
            })
            ->get()
            ->map(fn($r) => [
                'farm_id'            => $r->farm_id,
                'farm_name'          => $r->farm->farm_name,
                'ammonia'            => $r->ammonia,
                'ammonia_status'     => $r->ammonia_status,
                'temperature'        => $r->temperature,
                'temperature_status' => $r->temperature_status,
                'humidity'           => $r->humidity,
                'humidity_status'    => $r->humidity_status,
            ]);

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
                'upcoming_inspections'=> $upcomingInspections,
                'critical_farms'      => $criticalFarms,
            ],
        ]);
    }
}