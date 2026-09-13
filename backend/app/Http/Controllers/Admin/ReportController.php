<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inspection;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\Farm;
use App\Models\MaintenanceLog;
use App\Models\AlertHistory;
use App\Services\MaintenanceStatusService;

class ReportController extends Controller
{
    private const ADMIN_SERVICE_TYPES = ['Odor Control Request', 'Fly Control Request'];

    public function index()
    {
        // ---------------------------------------------------- unchanged
        $totalInspections     = Inspection::count();
        $completedInspections = Inspection::where('status', 'Completed')->count();
        $scheduledInspections = Inspection::where('status', 'Scheduled')->count();
        $generalInspections   = Inspection::where('inspection_type', 'General Inspection')->count();
        $followUpInspections  = Inspection::where('inspection_type', 'Follow-up')->count();

        $totalAlerts       = SensorReading::count();
        $ammoniaBreaches   = SensorReading::where('ammonia_status', 'Critical')->count();
        $tempAnomalies     = SensorReading::where('temperature_status', '!=', 'Safe')->count();
        $humidityAnomalies = SensorReading::where('humidity_status', '!=', 'Safe')->count();
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
                // NEW — ISO date alongside the display string, so the new
                // Inspections tab's date-range filter can parse it
                // reliably instead of re-parsing the formatted string
                // (formatted-date parsing across browsers is fragile —
                // learned that the hard way on Alert History's sort).
                'completed_at_raw'  => $i->completed_at?->toIso8601String(),
                'status'            => $i->status,
            ]);

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
                'id'               => $r->request_number,
                'service_type'     => $r->service_type,
                'farm_name'        => $r->farm->farm_name,
                'owner_name'       => $r->farm->owner_name,
                'barangay'         => $r->farm->barangay,
                'completed_at'     => $r->completed_at?->format('M d, Y'),
                'completed_at_raw' => $r->completed_at?->toIso8601String(), // NEW, same reasoning as above
                'notes'            => $r->notes,
                'status'           => $r->status,
            ]);

        // ------------------------------------------------------------- NEW
        // Maintenance tab — reuses the same MaintenanceStatusService the
        // Overdue Maintenance page already relies on, so "Overdue" /
        // "Non-Compliant" here mean exactly the same thing they do there.
        $maintenanceService = app(MaintenanceStatusService::class);
        $activeFarms = Farm::where('status', 'Active')->get();

        $maintenanceStatuses = $activeFarms->map(function ($farm) use ($maintenanceService) {
            $status = $maintenanceService->getStatus($farm);
            return array_merge($status, [
                'farm_id'    => $farm->id,
                'farm_name'  => $farm->farm_name,
                'owner_name' => $farm->owner_name,
                'barangay'   => $farm->barangay,
                'farm_size'  => $farm->farm_size,
            ]);
        });

        $overdueFarmsList      = $maintenanceStatuses->where('status', 'Overdue')->values();
        $nonCompliantFarmsList = $maintenanceStatuses->where('status', 'Non-Compliant')->values();

        $completedMaintenanceThisMonth = MaintenanceLog::whereMonth('performed_at', now()->month)
            ->whereYear('performed_at', now()->year)
            ->count();

        $maintenanceLogsList = MaintenanceLog::with('farm')
            ->latest('performed_at')
            ->limit(200)
            ->get()
            ->map(fn($log) => [
                'id'               => $log->id,
                'farm_name'        => $log->farm->farm_name ?? '—',
                'owner_name'       => $log->farm->owner_name ?? '—',
                'barangay'         => $log->farm->barangay ?? '—',
                'method'           => $log->maintenance_type,
                'performed_at'     => $log->performed_at->format('M d, Y'),
                'performed_at_raw' => $log->performed_at->toIso8601String(),
                'notes'            => $log->notes,
            ]);

        // ------------------------------------------------------------- NEW
        // Alerts tab — reads AlertHistory (real, debounced, discrete
        // incidents with actual trigger/resolve timestamps) instead of
        // raw SensorReading rows. alert_summary above is left completely
        // untouched — this is purely additive for the new detail table
        // and trend chart, which need real incident-level data that
        // alert_summary was never designed to provide.
        $alertRecords = AlertHistory::with('farm')
            ->latest('triggered_at')
            ->limit(300)
            ->get()
            ->map(fn($a) => [
                'id'               => $a->id,
                'farm_name'        => $a->farm->farm_name ?? '—',
                'owner_name'       => $a->farm->owner_name ?? '—',
                'sensor_type'      => $a->sensor_type,
                'status'           => $a->status,
                'triggered_at'     => $a->triggered_at->format('M d, Y g:i A'),
                'triggered_at_raw' => $a->triggered_at->toIso8601String(),
                'resolved_at'      => $a->resolved_at?->format('M d, Y g:i A'),
                'is_ongoing'       => is_null($a->resolved_at),
            ]);

        // ------------------------------------------------------------- NEW
        // Overview tab — a couple of cheap counts specifically for the
        // Overview stat cards / donut chart, kept separate from the
        // detail-tab summaries above so nothing there needed touching.
        $totalFarms = Farm::count();

        $farmStatusBreakdown = [
            'normal'   => Farm::where('current_status', 'Safe')->count(),
            'warning'  => Farm::where('current_status', 'Warning')->count(),
            'critical' => Farm::where('current_status', 'Critical')->count(),
        ];

        return response()->json([
            'success' => true,
            'data'    => [
                'inspection_summary' => [
                    'total'     => $totalInspections,
                    'completed' => $completedInspections,
                    'scheduled' => $scheduledInspections,
                    'general'   => $generalInspections,
                    'follow_up' => $followUpInspections,
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

                // NEW — Overview tab
                'overview_summary' => [
                    'total_farms'               => $totalFarms,
                    'total_inspections'         => $totalInspections,
                    'total_alerts'              => $totalAlerts,
                    'critical_alerts'           => $criticalAlerts,
                    'pending_service_requests'  => $pendingServiceRequests,
                    'farm_status_breakdown'     => $farmStatusBreakdown,
                ],

                // NEW — Maintenance tab
                'maintenance_summary' => [
                    'completed_this_month' => $completedMaintenanceThisMonth,
                    'overdue'              => $overdueFarmsList->count(),
                    'non_compliant'        => $nonCompliantFarmsList->count(),
                ],
                'maintenance_overdue_list'       => $overdueFarmsList,
                'maintenance_non_compliant_list' => $nonCompliantFarmsList,
                'maintenance_completed_list'     => $maintenanceLogsList,

                // NEW — Alerts tab
                'alert_records' => $alertRecords,
            ],
        ]);
    }
}