<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Models\SensorReading;
use App\Services\FarmStatusService;
use App\Services\MaintenanceStatusService;
use App\Services\ReportAlertSeries;
use App\Support\LocalTime;
use App\Support\ReportPeriod;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    /**
     * Complete period-scoped records and counts for LGU reports. Timestamp
     * filters use Manila calendar boundaries converted to UTC; maintenance
     * performed_at is a date-only field. No reporting read changes records.
     * Farm inventory is the registration cohort, with current recorded
     * conditions; maintenance compliance is assessed at the period cutoff.
     */
    public function index(Request $request)
    {
        $period = ReportPeriod::fromRequest($request);
        $scope = fn ($query, string $column) => $period->scope($query, $column);
        $asOf = $period->asOf();
        $insp = fn () => $scope(Inspection::query(), ReportPeriod::INSPECTION_DATE);

        $totalInspections = $insp()->count();
        $completedInspections = $insp()->where('status', 'Completed')->count();
        $scheduledInspections = $insp()->where('status', 'Scheduled')->count();
        $generalInspections = $insp()->where('inspection_type', 'General Inspection')->count();
        $followUpInspections = $insp()->where('inspection_type', 'Follow-up')->count();

        $readings = fn () => $scope(SensorReading::query(), 'created_at');
        $totalAlerts = $readings()->count();
        $ammoniaBreaches = $readings()->whereNotNull('ammonia')->where('ammonia_status', 'Critical')->count();
        $tempAnomalies = $readings()->where('temperature_status', '!=', 'Safe')->count();
        $humidityAnomalies = $readings()->where('humidity_status', '!=', 'Safe')->count();
        // Raw READING count — how many individual readings carried a Critical
        // status. The generated-report tables label it exactly that way
        // ("Readings with any critical status"), so it stays a reading count.
        // moisture_status was missing here, which under-reported every farm
        // whose only Critical metric was manure moisture.
        $criticalAlerts = $readings()->where(function ($q) {
            $q->where(fn ($metric) => $metric->whereNotNull('ammonia')->where('ammonia_status', 'Critical'))
                ->orWhere(fn ($metric) => $metric->whereNotNull('moisture')->where('moisture_status', 'Critical'));
        })->count();

        // INCIDENT count — what the Overview "Critical Alerts" stat card is
        // actually asking for. A farm sitting at Critical for one day emits a
        // reading every few minutes, so the raw count above reached the
        // hundreds while Alert History (correctly) showed a handful of
        // incidents. Two numbers, same label, on the same screen. This is the
        // same AlertHistory source the Alerts tab and Alert History page use.
        $criticalIncidents = $scope(AlertHistory::query(), 'triggered_at')->where('status', 'Critical')->count();

        // Same correction for the Total card, which was left on the raw
        // reading count: it read 14,304 while Alert History showed 87, for a
        // label that says "Total Alerts". Beside it sat Critical Alerts
        // counting incidents — two different units, side by side.
        $totalIncidents = $scope(AlertHistory::query(), 'triggered_at')->count();

        // Per-metric INCIDENT counts, for the Alerts tab cards.
        //
        // Those cards used to sit on $tempAnomalies / $humidityAnomalies, which
        // are raw reading counts over every reading ever stored — hence
        // "Temperature Anomalies 14,272" next to "Total Alerts 87" on one row.
        // Temperature and humidity are advisory metrics anyway
        // (config/sensors.php alerting_metrics), so they never raise an alert
        // and there was nothing real for those two cards to count. Ammonia and
        // moisture are what the system actually alerts on, so they are what
        // the cards report, in the same unit as every other card beside them.
        $ammoniaIncidents = $scope(AlertHistory::query(), 'triggered_at')->where('sensor_type', 'ammonia')->count();
        $moistureIncidents = $scope(AlertHistory::query(), 'triggered_at')->where('sensor_type', 'moisture')->count();
        $ongoingIncidents = $scope(AlertHistory::query(), 'triggered_at')->where(fn ($q) => $q->whereNull('resolved_at')->orWhere('resolved_at', '>', $asOf))->count();
        $resolvedIncidents = $totalIncidents - $ongoingIncidents;

        $completedInspectionsList = $scope(Inspection::with('farm'), 'completed_at')
            ->where('status', 'Completed')
            ->latest()->orderByDesc('id')
            ->get()
            ->map(fn ($i) => [
                'id' => $i->id,
                'inspection_number' => $i->inspection_number,
                'farm_name' => $i->farm?->farm_name ?? '—',
                'owner_name' => $i->farm?->owner_name ?? '—',
                'inspection_type' => $i->inspection_type,
                'completed_at' => LocalTime::date($i->completed_at),
                // NEW — ISO date alongside the display string, so the new
                // Inspections tab's date-range filter can parse it
                // reliably instead of re-parsing the formatted string
                // (formatted-date parsing across browsers is fragile —
                // learned that the hard way on Alert History's sort).
                'completed_at_raw' => $i->completed_at?->toIso8601String(),
                'status' => $i->status,
            ]);

        // Super Admin Reports lists Completed AND Scheduled inspections (the
        // Admin page keeps using completed_inspections above). `date_raw` is
        // whichever date the row is "about": completion date for Completed,
        // scheduled date for Scheduled — that's what the date filter uses.
        $inspectionRecordsList = $scope(Inspection::with('farm'), ReportPeriod::INSPECTION_DATE)
            ->whereIn('status', ['Completed', 'Scheduled'])
            ->get()
            ->map(function ($i) {
                $date = $i->status === 'Completed' ? $i->completed_at : $i->scheduled_at;

                return [
                    'id' => $i->id,
                    'inspection_number' => $i->inspection_number,
                    'farm_name' => $i->farm?->farm_name ?? '—',
                    'owner_name' => $i->farm?->owner_name ?? '—',
                    'inspection_type' => $i->inspection_type,
                    'date' => LocalTime::date($date),
                    'date_raw' => $date?->toIso8601String(),
                    'status' => $i->status,
                ];
            })
            ->sortByDesc('date_raw')
            ->values();

        // ------------------------------------------------------------- NEW
        // Maintenance tab — reuses the same MaintenanceStatusService the
        // Overdue Maintenance page already relies on. There is no interim
        // overdue/grace state: a farm becomes Non-Compliant the day after
        // its annual due date.
        $maintenanceService = app(MaintenanceStatusService::class);
        $activeFarms = Farm::where('status', 'Active')->where(fn ($q) => $q->whereNull('created_at')->orWhere('created_at', '<=', $asOf))->with('qualifyingCleanouts')->get();

        $maintenanceStatuses = $activeFarms->map(function ($farm) use ($maintenanceService, $asOf) {
            $status = $maintenanceService->getStatus($farm, $asOf->copy()->setTimezone(LocalTime::timezone()));

            return array_merge($status, [
                'farm_id' => $farm->id,
                'farm_name' => $farm->farm_name,
                'owner_name' => $farm->owner_name,
                'barangay' => $farm->barangay,
                'farm_size' => $farm->farm_size,
            ]);
        });

        $nonCompliantFarmsList = $maintenanceStatuses->where('status', 'Non-Compliant')->values();

        $completedMaintenanceThisMonth = $period->scope(MaintenanceLog::where('maintenance_type', MaintenanceStatusService::FULL_CLEANOUT), 'performed_at', true)->count();

        $maintenanceLogsList = $period->scope(MaintenanceLog::with('farm')->where('maintenance_type', MaintenanceStatusService::FULL_CLEANOUT), 'performed_at', true)
            ->latest('performed_at')->orderByDesc('id')
            ->get()
            ->map(fn ($log) => [
                'id' => $log->id,
                'farm_name' => $log->farm->farm_name ?? '—',
                'owner_name' => $log->farm->owner_name ?? '—',
                'barangay' => $log->farm->barangay ?? '—',
                'method' => $log->maintenance_type,
                'performed_at' => $log->performed_at->format('M d, Y'),
                'performed_at_raw' => $log->performed_at->toDateString(),
                'notes' => $log->notes,
            ]);

        // ------------------------------------------------------------- NEW
        // Incident details, counters and bars share this same date-scoped source.
        $alertQuery = fn () => $scope(AlertHistory::query(), 'triggered_at');
        $alertRecords = $alertQuery()->with(['farm', 'sensor'])
            ->latest('triggered_at')->orderByDesc('id')
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'farm_name' => $a->farm->farm_name ?? '—',
                'owner_name' => $a->farm->owner_name ?? '—',
                // Which poultry house the incident happened in — null for
                // rows recorded before per-device alert tracking.
                'device_name' => $a->sensor?->device_name,
                'farm_id' => $a->farm_id,
                'sensor_id' => $a->sensor_id,
                'sensor_type' => $a->sensor_type,
                'status' => $a->status,
                'triggered_at' => LocalTime::dateTime($a->triggered_at),
                'triggered_at_raw' => $a->triggered_at->toIso8601String(),
                'resolved_at' => $a->resolved_at && $a->resolved_at <= $asOf ? LocalTime::dateTime($a->resolved_at) : null,
                'is_ongoing' => is_null($a->resolved_at) || $a->resolved_at > $asOf,
            ]);

        // ------------------------------------------------------------- NEW
        // Overview tab — a couple of cheap counts specifically for the
        // Overview stat cards / donut chart, kept separate from the
        // detail-tab summaries above so nothing there needed touching.
        $selectedFarms = $scope(Farm::query(), 'created_at')->with(['sensors', 'sensorReadings' => fn ($q) => $q->latest()->limit(1)])->get();
        $totalFarms = $selectedFarms->count();

        // Bucketed by the same "Pending Setup unless there's an active
        // device with an actual reading" rule used everywhere else a farm's
        // monitoring status is shown, so a farm with no device is never
        // counted as "Safe" here either.
        $farmStatusBreakdown = app(\App\Services\MonitoringAssessmentService::class)->breakdown($selectedFarms);

        return response()->json([
            'success' => true,
            'data' => [
                'reading_data_completeness' => app(\App\Services\MonitoringAssessmentService::class)->readingCounts($readings()),
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
                    // Separate key, not a replacement: the generated-report
                    // tables print 'critical_alerts' under the honest label
                    // "Readings with any critical status", while the Reports
                    // stat card wants discrete incidents. Both are correct —
                    // they answer different questions.
                    'critical_incidents' => $criticalIncidents,
                    'total_incidents' => $totalIncidents,
                    'ammonia_incidents' => $ammoniaIncidents,
                    'moisture_incidents' => $moistureIncidents,
                    'ongoing_incidents' => $ongoingIncidents,
                    'resolved_incidents' => $resolvedIncidents,
                ],
                'completed_inspections' => $completedInspectionsList,
                'inspection_records' => $inspectionRecordsList,

                // NEW — Overview tab
                'overview_summary' => [
                    'total_farms' => $totalFarms,
                    'total_inspections' => $totalInspections,
                    'total_alerts' => $totalIncidents,
                    'critical_alerts' => $criticalIncidents,
                    'farm_status_breakdown' => $farmStatusBreakdown,
                ],

                // NEW — Maintenance tab
                'maintenance_summary' => [
                    'policy' => MaintenanceStatusService::POLICY,
                    'compliant' => $maintenanceStatuses->where('status', 'Compliant')->count(),
                    'undetermined' => $maintenanceStatuses->where('status', 'Undetermined')->count(),
                    'completed_this_month' => $completedMaintenanceThisMonth,
                    'non_compliant' => $nonCompliantFarmsList->count(),
                ],
                'maintenance_non_compliant_list' => $nonCompliantFarmsList,
                'maintenance_completed_list' => $maintenanceLogsList,

                // NEW — Alerts tab
                'alert_records' => $alertRecords,
                'alert_trend' => app(ReportAlertSeries::class)->build($alertQuery(), $period),
                'report_period' => ['from' => $period->from, 'to' => $period->to, 'status_as_of' => LocalTime::dateTime($asOf)],
            ],
        ]);
    }
}
