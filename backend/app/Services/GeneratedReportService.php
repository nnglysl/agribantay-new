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
use App\Support\LocalTime;

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

    /**
     * Actual generation instant of a report, in the reader's local time.
     *
     * Single-sourced through App\Support\LocalTime so this agrees with every
     * other user-facing timestamp in the system; the PHT suffix is kept because
     * an official document should state the clock it is quoting.
     */
    public function generatedLabel($timestamp, bool $withTime = true): string
    {
        $local = LocalTime::forDisplay($timestamp);

        return $withTime
            ? $local->format('M d, Y').' at '.$local->format('g:i A').' PHT'
            : $local->format('M d, Y');
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
        // $start/$end are the reporting period as PHILIPPINE calendar dates, and
        // stay that way for everything the reader sees: the stored period_start /
        // period_end, the period label, and the status cutoff.
        //
        // Queries need the same window as UTC instants, because PDO binds a Carbon
        // with format('Y-m-d H:i:s') in the Carbon's OWN timezone — a Manila-zoned
        // bound would otherwise be sent as its local wall clock and silently compared
        // against UTC-stored values. September in San Jose is 31 Aug 16:00:00Z to
        // 30 Sep 15:59:59Z, which is the eight hours at each end that used to land in
        // the wrong month.
        //
        // Callers that still pass UTC-zoned bounds are unaffected: ->utc() is then a
        // no-op and the window is exactly what it was.
        $from = $start->copy()->utc();
        $to = $end->copy()->utc();

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
            ->whereBetween('completed_at', [$from, $to])
            ->latest('completed_at')
            ->get()
            ->map(fn ($i) => [
                'inspection_number' => $i->inspection_number,
                'farm_name' => $i->farm->farm_name ?? '—',
                'owner_name' => $i->farm->owner_name ?? '—',
                'inspection_type' => $i->inspection_type,
                'completed_at' => LocalTime::date($i->completed_at),
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
            ->whereBetween('completed_at', [$from, $to])
            ->latest('completed_at')
            ->get()
            ->map(fn ($r) => [
                'service_type' => $r->service_type,
                'farm_name' => $r->farm->farm_name ?? '—',
                'owner_name' => $r->farm->owner_name ?? '—',
                'barangay' => $r->farm->barangay ?? '—',
                'completed_at' => LocalTime::date($r->completed_at),
                'notes' => $r->notes,
            ])
            ->values();

        // Compliance is a status snapshot, not period activity. It is taken at
        // the END of the reporting period so a September report states September's
        // position rather than whatever happens to be true on the day it runs —
        // and farms registered after the cutoff are excluded, since they did not
        // exist in the period being reported. snapshot['status_as_of'] carries the
        // cutoff through to the printed document so the date is stated on the page.
        $maintenanceService = app(MaintenanceStatusService::class);
        $activeFarms = Farm::where('status', 'Active')
            ->where('created_at', '<=', $to)
            ->with('latestCleanout')
            ->get();

        $maintenanceStatuses = $activeFarms->map(function ($farm) use ($maintenanceService, $to) {
            $status = $maintenanceService->getStatus($farm, $to);

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

        // Clean-outs completed inside the report period. This previously used
        // now()->month / now()->year, i.e. the month the snapshot happens to run
        // in rather than the month being reported. reports:generate-monthly
        // archives *last* month on the 1st, so a September report generated on
        // 1 October counted October's clean-outs, and the figure contradicted the
        // period-filtered $maintenanceCompletedList table it summarises.
        // The snapshot key stays completed_this_month so existing archived
        // reports and all three report views keep working unchanged.
        $completedMaintenanceThisMonth = MaintenanceLog::whereBetween('performed_at', [$from, $to])
            ->count();

        $maintenanceCompletedList = MaintenanceLog::with('farm')
            ->whereBetween('performed_at', [$from, $to])
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
            ->whereBetween('triggered_at', [$from, $to])
            ->latest('triggered_at')
            ->get()
            ->map(fn ($a) => [
                'farm_name' => $a->farm->farm_name ?? '—',
                'owner_name' => $a->farm->owner_name ?? '—',
                'sensor_type' => $a->sensor_type,
                'status' => $a->status,
                'triggered_at' => LocalTime::dateTime($a->triggered_at),
                'resolved_at' => LocalTime::dateTime($a->resolved_at),
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
            ->whereBetween('completed_at', [$from, $to])
            ->latest('completed_at')
            ->get()
            ->map(fn ($r) => [
                'service_type' => $r->service_type,
                'farm_name' => $r->farm->farm_name ?? '—',
                'owner_name' => $r->farm->owner_name ?? '—',
                'barangay' => $r->farm->barangay ?? '—',
                'vet_name' => trim(($r->acceptedBy->first_name ?? '').' '.($r->acceptedBy->last_name ?? '')) ?: '—',
                'completed_at' => LocalTime::date($r->completed_at),
                'notes' => $r->notes,
            ])
            ->values();

        // Period-scoped activity counts. These are taken from the very same
        // collections rendered as the detail tables below, so a summary figure
        // can never disagree with the rows it summarises. The pre-existing
        // all-time summaries are left exactly as they were and are labelled
        // as all-time in the report views; these are additive, so snapshots
        // archived before this change keep rendering unchanged.
        $vetFarmsCoveredInPeriod = $vetQuery()
            ->where('status', 'Completed')
            ->whereBetween('completed_at', [$from, $to])
            ->distinct('farm_id')
            ->count('farm_id');

        return [
            'period' => [
                'start' => $start->toDateTimeString(),
                'end' => $end->toDateTimeString(),
            ],
            'status_as_of' => $end->format('M d, Y'),
            'period_activity' => [
                'inspections_completed' => $completedInspectionsList->count(),
                'alerts_recorded' => $alertRecordsList->count(),
                'cleanouts_completed' => $maintenanceCompletedList->count(),
                'services_completed' => $completedServicesList->count(),
                'vet_services_completed' => $vetServicesList->count(),
                'vet_farms_covered' => $vetFarmsCoveredInPeriod,
            ],
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
