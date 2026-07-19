<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inspection;
use App\Models\SensorReading;
use App\Models\ServiceRequest;

class ReportController extends Controller
{
    // The two service types Admin actually handles — mirrors
    // ServiceRequestController's VET_ONLY_TYPES exclusion, just from the
    // other side: these are the ones NOT sent to the Vet.
    private const ADMIN_SERVICE_TYPES = ['Odor Control Request', 'Fly Control Request'];

    public function index()
    {
        $totalInspections     = Inspection::count();
        $completedInspections = Inspection::where('status', 'Completed')->count();
        $scheduledInspections = Inspection::where('status', 'Scheduled')->count();
        $generalInspections   = Inspection::where('inspection_type', 'General Inspection')->count();
        $followUpInspections  = Inspection::where('inspection_type', 'Follow-up')->count();

        $totalAlerts       = SensorReading::count();
        $ammoniaBreaches   = SensorReading::where('ammonia_status', 'Critical')->count();
        $tempAnomalies     = SensorReading::where('temperature_status', '!=', 'Normal')->count();
        $humidityAnomalies = SensorReading::where('humidity_status', '!=', 'Normal')->count();
        $criticalAlerts    = SensorReading::where(function ($q) {
            $q->where('ammonia_status', 'Critical')
              ->orWhere('temperature_status', 'Critical')
              ->orWhere('humidity_status', 'Critical');
        })->count();

        $completedInspectionsList = Inspection::with('farm')
            ->where('status', 'Completed')
            ->latest()
            ->get()
            ->map(fn($i) => [
                'id'                => $i->id,
                'inspection_number' => $i->inspection_number,
                'farm_name'         => $i->farm->farm_name,
                'owner_name'        => $i->farm->owner_name,
                'inspection_type'   => $i->inspection_type,
                'completed_at'      => $i->completed_at?->format('M d, Y'),
                'status'            => $i->status,
            ]);

        // Odor Control / Fly Control — previously not reported on at all.
        $serviceQuery = fn() => ServiceRequest::whereIn('service_type', self::ADMIN_SERVICE_TYPES);

        $totalServiceRequests     = $serviceQuery()->count();
        $completedServiceRequests = $serviceQuery()->where('status', 'Completed')->count();
        $pendingServiceRequests   = $serviceQuery()->where('status', 'Pending')->count();

        $completedServicesList = $serviceQuery()
            ->with('farm')
            ->where('status', 'Completed')
            ->latest('completed_at')
            ->get()
            ->map(fn($r) => [
                'id'            => $r->request_number,
                'service_type'  => $r->service_type,
                'farm_name'     => $r->farm->farm_name,
                'owner_name'    => $r->farm->owner_name,
                'barangay'      => $r->farm->barangay,
                'completed_at'  => $r->completed_at?->format('M d, Y'),
                'notes'         => $r->notes,
                'status'        => $r->status,
            ]);

        return response()->json([
            'success' => true,
            'data'    => [
                'inspection_summary' => [
                    'total'       => $totalInspections,
                    'completed'   => $completedInspections,
                    'scheduled'   => $scheduledInspections,
                    'general'     => $generalInspections,
                    'follow_up'   => $followUpInspections,
                ],
                'alert_summary' => [
                    'total'              => $totalAlerts,
                    'ammonia_breaches'   => $ammoniaBreaches,
                    'temp_anomalies'     => $tempAnomalies,
                    'humidity_anomalies' => $humidityAnomalies,
                    'critical_alerts'    => $criticalAlerts,
                ],
                'service_summary' => [
                    'total'     => $totalServiceRequests,
                    'completed' => $completedServiceRequests,
                    'pending'   => $pendingServiceRequests,
                ],
                'completed_inspections' => $completedInspectionsList,
                'completed_services'    => $completedServicesList,
            ],
        ]);
    }
}