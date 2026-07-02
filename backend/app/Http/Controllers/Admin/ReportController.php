<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inspection;
use App\Models\SensorReading;

class ReportController extends Controller
{
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
                'completed_inspections' => $completedInspectionsList,
            ],
        ]);
    }
}