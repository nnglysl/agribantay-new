<?php

namespace App\Services;

use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\GeneratedReport;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Services\FarmStatusService;
use Illuminate\Support\Carbon;

/**
 * Builds and persists the frozen monthly report snapshot used by the
 * admin Reports > Files archive. Shared by GeneratedReportController
 * (manual generation, if ever re-enabled) and the reports:generate-monthly
 * scheduled command so both produce identical report content.
 */
class GeneratedReportService
{
    private const ADMIN_SERVICE_TYPES = ['Odor Control Request', 'Fly Control Request'];

    private const VET_SERVICE_TYPES = ['Vaccine Request', 'Blood Test Request'];

    public function generateForPeriod(string $reportName, Carbon $start, Carbon $end, ?int $generatedById = null): GeneratedReport
    {
        return GeneratedReport::create([
            'report_name' => $reportName,
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'report_type' => 'PDF',
            'generated_by_id' => $generatedById,
            'snapshot' => $this->buildSnapshot($start, $end),
        ]);
    }

    public function periodLabel($start, $end): string
    {
        $start = Carbon::parse($start);
        $end = Carbon::parse($end);

        if ($start->isSameDay($end)) {
            return $start->format('M d, Y');
        }

        if ($start->isSameMonth($end) && $start->day === 1 && $end->isSameDay($end->copy()->endOfMonth())) {
            return $start->format('M j').'–'.$end->format('j, Y');
        }

        return $start->format('M j, Y').' – '.$end->format('M j, Y');
    }

    public function buildSnapshot(Carbon $start, Carbon $end): array
    {
        $totalInspections = Inspection::count();
        $completedInspections = Inspection::where('status', 'Completed')->count();
        $scheduledInspections = Inspection::where('status', 'Scheduled')->count();
        $generalInspections = Inspection::where('inspection_type', 'General Inspection')->count();
        $followUpInspections = Inspection::where('inspection_type', 'Follow-up')->count();

        $totalAlerts = SensorReading::count();
        $ammoniaBreaches = SensorReading::where('ammonia_status', 'Critical')->count();
        $tempAnomalies = SensorReading::where('temperature_status', '!=', 'Safe')->count();
        $humidityAnomalies = SensorReading::where('humidity_status', '!=', 'Safe')->count();
        $criticalAlerts = SensorReading::where(function ($q) {
            $q->where('ammonia_status', 'Critical')
                ->orWhere('temperature_status', 'Critical')
                ->orWhere('humidity_status', 'Critical');
        })->count();

        $completedInspectionsList = Inspection::with('farm')
            ->where('status', 'Completed')
            ->whereBetween('completed_at', [$start, $end])
            ->latest('completed_at')
            ->get()
            ->map(fn ($i) => [
                'inspection_number' => $i->inspection_number,
                'farm_name' => $i->farm->farm_name ?? '—',
                'owner_name' => $i->farm->owner_name ?? '—',
                'inspection_type' => $i->inspection_type,
                'completed_at' => $i->completed_at?->format('M d, Y'),
                'status' => $i->status,
            ])
            ->values();

        $serviceQuery = fn () => ServiceRequest::whereIn('service_type', self::ADMIN_SERVICE_TYPES);

        $totalServiceRequests = $serviceQuery()->count();
        $completedServiceRequests = $serviceQuery()->where('status', 'Completed')->count();
        $pendingServiceRequests = $serviceQuery()->where('status', 'Pending')->count();

        $completedServicesList = $serviceQuery()
            ->with('farm')
            ->where('status', 'Completed')
            ->whereBetween('completed_at', [$start, $end])
            ->latest('completed_at')
            ->get()
            ->map(fn ($r) => [
                'service_type' => $r->service_type,
                'farm_name' => $r->farm->farm_name ?? '—',
                'owner_name' => $r->farm->owner_name ?? '—',
                'barangay' => $r->farm->barangay ?? '—',
                'completed_at' => $r->completed_at?->format('M d, Y'),
                'notes' => $r->notes,
            ])
            ->values();

        $maintenanceService = app(MaintenanceStatusService::class);
        $activeFarms = Farm::where('status', 'Active')->get();

        $maintenanceStatuses = $activeFarms->map(function ($farm) use ($maintenanceService) {
            $status = $maintenanceService->getStatus($farm);

            return array_merge($status, [
                'farm_name' => $farm->farm_name,
                'owner_name' => $farm->owner_name,
                'barangay' => $farm->barangay,
            ]);
        });

        $maintenanceOverdueList = $maintenanceStatuses
            ->whereIn('status', ['Overdue', 'Non-Compliant'])
            ->map(fn ($f) => [
                'farm_name' => $f['farm_name'],
                'owner_name' => $f['owner_name'],
                'barangay' => $f['barangay'],
                'last_performed_at' => $f['last_performed_at'],
                'days_overdue' => $f['days_overdue'],
                'status' => $f['status'],
            ])
            ->values();

        $completedMaintenanceThisMonth = MaintenanceLog::whereMonth('performed_at', now()->month)
            ->whereYear('performed_at', now()->year)
            ->count();

        $maintenanceCompletedList = MaintenanceLog::with('farm')
            ->whereBetween('performed_at', [$start, $end])
            ->latest('performed_at')
            ->get()
            ->map(fn ($log) => [
                'farm_name' => $log->farm->farm_name ?? '—',
                'owner_name' => $log->farm->owner_name ?? '—',
                'barangay' => $log->farm->barangay ?? '—',
                'method' => $log->maintenance_type,
                'performed_at' => $log->performed_at->format('M d, Y'),
                'notes' => $log->notes,
            ])
            ->values();

        $alertRecordsList = AlertHistory::with('farm')
            ->whereBetween('triggered_at', [$start, $end])
            ->latest('triggered_at')
            ->get()
            ->map(fn ($a) => [
                'farm_name' => $a->farm->farm_name ?? '—',
                'owner_name' => $a->farm->owner_name ?? '—',
                'sensor_type' => $a->sensor_type,
                'status' => $a->status,
                'triggered_at' => $a->triggered_at->format('M d, Y g:i A'),
                'resolved_at' => $a->resolved_at?->format('M d, Y g:i A'),
            ])
            ->values();

        $totalFarms = Farm::count();
        // Same "Pending Setup unless there's an active device with an actual
        // reading" rule used everywhere else a farm's monitoring status is
        // shown, so an archived monthly report never counts a device-less
        // farm as "Safe".
        $farmStatusBreakdown = app(FarmStatusService::class)->statusBreakdown();

        // Vet-side data — combined across every veterinarian (not scoped to
        // one assignee), so the archived monthly report is a genuinely
        // municipal-wide record covering both the admin and vet sides.
        $vetQuery = fn () => ServiceRequest::whereIn('service_type', self::VET_SERVICE_TYPES);

        $vetTotalCompleted = $vetQuery()->where('status', 'Completed')->count();
        $vetFarmsCovered = $vetQuery()->where('status', 'Completed')->distinct('farm_id')->count('farm_id');

        $vetServicesList = $vetQuery()
            ->with(['farm', 'acceptedBy'])
            ->where('status', 'Completed')
            ->whereBetween('completed_at', [$start, $end])
            ->latest('completed_at')
            ->get()
            ->map(fn ($r) => [
                'service_type' => $r->service_type,
                'farm_name' => $r->farm->farm_name ?? '—',
                'owner_name' => $r->farm->owner_name ?? '—',
                'barangay' => $r->farm->barangay ?? '—',
                'vet_name' => trim(($r->acceptedBy->first_name ?? '').' '.($r->acceptedBy->last_name ?? '')) ?: '—',
                'completed_at' => $r->completed_at?->format('M d, Y'),
                'notes' => $r->notes,
            ])
            ->values();

        return [
            'inspection_summary' => [
                'total' => $totalInspections,
                'completed' => $completedInspections,
                'scheduled' => $scheduledInspections,
                'general' => $generalInspections,
                'follow_up' => $followUpInspections,
            ],
            'alert_summary' => [
                'total' => $totalAlerts,
                'ammonia_breaches' => $ammoniaBreaches,
                'temp_anomalies' => $tempAnomalies,
                'humidity_anomalies' => $humidityAnomalies,
                'critical_alerts' => $criticalAlerts,
            ],
            'service_summary' => [
                'total' => $totalServiceRequests,
                'completed' => $completedServiceRequests,
                'pending' => $pendingServiceRequests,
            ],
            'maintenance_summary' => [
                'completed_this_month' => $completedMaintenanceThisMonth,
                'overdue' => $maintenanceStatuses->where('status', 'Overdue')->count(),
                'non_compliant' => $maintenanceStatuses->where('status', 'Non-Compliant')->count(),
            ],
            'farm_overview' => [
                'total_farms' => $totalFarms,
                'normal' => $farmStatusBreakdown['normal'],
                'warning' => $farmStatusBreakdown['warning'],
                'critical' => $farmStatusBreakdown['critical'],
            ],
            'vet_summary' => [
                'total_completed' => $vetTotalCompleted,
                'farms_covered' => $vetFarmsCovered,
            ],
            'completed_inspections' => $completedInspectionsList,
            'alert_records' => $alertRecordsList,
            'maintenance_overdue' => $maintenanceOverdueList,
            'maintenance_completed' => $maintenanceCompletedList,
            'completed_services' => $completedServicesList,
            'vet_services' => $vetServicesList,
        ];
    }
}
