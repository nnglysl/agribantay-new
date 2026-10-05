<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inspection;
use Illuminate\Http\Request;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\Farm;
use App\Models\MaintenanceLog;
use App\Models\AlertHistory;
use App\Services\MaintenanceStatusService;
use App\Support\LocalTime;

class ReportController extends Controller
{
    private const ADMIN_SERVICE_TYPES = ['Odor Control Request', 'Fly Control Request'];

    /**
     * `from` / `to` are optional Philippine calendar dates. When they are
     * absent every figure is all-time, exactly as before — so nothing that
     * calls this without a range changes behaviour.
     *
     * When they are present the ACTIVITY counts are scoped to the period.
     * Previously the Reports page filtered its tables client-side while the
     * stat cards above them stayed all-time: picking September showed
     * September in the table and the whole database in the headline number.
     * Scoping has to happen here rather than in the browser because the
     * detail lists this page receives are capped at 300 rows — counting them
     * would quietly go wrong past that.
     *
     * Farm totals and pending request counts stay unscoped on purpose: they
     * describe the situation right now, not activity within a period.
     */
    public function index(Request $request)
    {
        $from = $request->filled('from') ? LocalTime::startOfLocalDay($request->input('from'))->utc() : null;
        $to   = $request->filled('to') ? LocalTime::endOfLocalDay($request->input('to'))->utc() : null;
        $ranged = $from || $to;

        // Applies the window to a query on $column, or leaves it alone when
        // no range was asked for.
        $scope = function ($query, string $column) use ($from, $to) {
            if ($from) $query->where($column, '>=', $from);
            if ($to) $query->where($column, '<=', $to);
            return $query;
        };

        // Counted on scheduled_at: an inspection belongs to the period it was
        // due in, which is the date the table and the calendar both show.
        $insp = fn () => $scope(Inspection::query(), 'scheduled_at');

        $totalInspections     = $insp()->count();
        $completedInspections = $insp()->where('status', 'Completed')->count();
        $scheduledInspections = $insp()->where('status', 'Scheduled')->count();
        $generalInspections   = $insp()->where('inspection_type', 'General Inspection')->count();
        $followUpInspections  = $insp()->where('inspection_type', 'Follow-up')->count();

        $totalAlerts       = SensorReading::count();
        $ammoniaBreaches   = SensorReading::where('ammonia_status', 'Critical')->count();
        $tempAnomalies     = SensorReading::where('temperature_status', '!=', 'Safe')->count();
        $humidityAnomalies = SensorReading::where('humidity_status', '!=', 'Safe')->count();
        // Raw READING count — how many individual readings carried a Critical
        // status. The generated-report tables label it exactly that way
        // ("Readings with any critical status"), so it stays a reading count.
        // moisture_status was missing here, which under-reported every farm
        // whose only Critical metric was manure moisture.
        $criticalAlerts    = SensorReading::where(function ($q) {
            $q->where('ammonia_status', 'Critical')
              ->orWhere('temperature_status', 'Critical')
              ->orWhere('humidity_status', 'Critical')
              ->orWhere('moisture_status', 'Critical');
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
        $ammoniaIncidents  = $scope(AlertHistory::query(), 'triggered_at')->where('sensor_type', 'ammonia')->count();
        $moistureIncidents = $scope(AlertHistory::query(), 'triggered_at')->where('sensor_type', 'moisture')->count();
        $ongoingIncidents  = $scope(AlertHistory::query(), 'triggered_at')->whereNull('resolved_at')->count();
        $resolvedIncidents = $totalIncidents - $ongoingIncidents;

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
                'completed_at'      => LocalTime::date($i->completed_at),
                // NEW — ISO date alongside the display string, so the new
                // Inspections tab's date-range filter can parse it
                // reliably instead of re-parsing the formatted string
                // (formatted-date parsing across browsers is fragile —
                // learned that the hard way on Alert History's sort).
                'completed_at_raw'  => $i->completed_at?->toIso8601String(),
                'status'            => $i->status,
            ]);

        // Super Admin Reports lists Completed AND Scheduled inspections (the
        // Admin page keeps using completed_inspections above). `date_raw` is
        // whichever date the row is "about": completion date for Completed,
        // scheduled date for Scheduled — that's what the date filter uses.
        $inspectionRecordsList = Inspection::with('farm')
            ->whereIn('status', ['Completed', 'Scheduled'])
            ->get()
            ->map(function ($i) {
                $date = $i->status === 'Completed' ? $i->completed_at : $i->scheduled_at;
                return [
                    'id'                => $i->id,
                    'inspection_number' => $i->inspection_number,
                    'farm_name'         => $i->farm->farm_name,
                    'owner_name'        => $i->farm->owner_name,
                    'inspection_type'   => $i->inspection_type,
                    'date'              => LocalTime::date($date),
                    'date_raw'          => $date?->toIso8601String(),
                    'status'            => $i->status,
                ];
            })
            ->sortByDesc('date_raw')
            ->values();

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
                'completed_at'     => LocalTime::date($r->completed_at),
                'completed_at_raw' => $r->completed_at?->toIso8601String(), // NEW, same reasoning as above
                'notes'            => $r->notes,
                'status'           => $r->status,
            ]);

        // Completed + Scheduled admin-handled requests for Super Admin
        // Reports (same shape/date rule as $inspectionRecordsList).
        $serviceRecordsList = $serviceQuery()
            ->with('farm')
            ->whereIn('status', ['Completed', 'Scheduled'])
            ->get()
            ->map(function ($r) {
                $date = $r->status === 'Completed' ? $r->completed_at : $r->scheduled_at;
                return [
                    'id'           => $r->request_number,
                    'service_type' => $r->service_type,
                    'farm_name'    => $r->farm->farm_name,
                    'owner_name'   => $r->farm->owner_name,
                    'barangay'     => $r->farm->barangay,
                    'date'         => LocalTime::date($date),
                    'date_raw'     => $date?->toIso8601String(),
                    'status'       => $r->status,
                ];
            })
            ->sortByDesc('date_raw')
            ->values();

        // ------------------------------------------------------------- NEW
        // Maintenance tab — reuses the same MaintenanceStatusService the
        // Overdue Maintenance page already relies on, so "Overdue" /
        // "Non-Compliant" here mean exactly the same thing they do there.
        $maintenanceService = app(MaintenanceStatusService::class);
        $activeFarms = Farm::where('status', 'Active')->with('latestCleanout')->get();

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
        $alertRecords = AlertHistory::with(['farm', 'sensor'])
            ->latest('triggered_at')
            ->limit(300)
            ->get()
            ->map(fn($a) => [
                'id'               => $a->id,
                'farm_name'        => $a->farm->farm_name ?? '—',
                'owner_name'       => $a->farm->owner_name ?? '—',
                // Which poultry house the incident happened in — null for
                // rows recorded before per-device alert tracking.
                'device_name'      => $a->sensor?->device_name,
                'sensor_type'      => $a->sensor_type,
                'status'           => $a->status,
                'triggered_at'     => LocalTime::dateTime($a->triggered_at),
                'triggered_at_raw' => $a->triggered_at->toIso8601String(),
                'resolved_at'      => LocalTime::dateTime($a->resolved_at),
                'is_ongoing'       => is_null($a->resolved_at),
            ]);

        // ------------------------------------------------------------- NEW
        // Overview tab — a couple of cheap counts specifically for the
        // Overview stat cards / donut chart, kept separate from the
        // detail-tab summaries above so nothing there needed touching.
        $totalFarms = Farm::count();

        // Bucketed by the same "Pending Setup unless there's an active
        // device with an actual reading" rule used everywhere else a farm's
        // monitoring status is shown, so a farm with no device is never
        // counted as "Safe" here either.
        $farmStatusBreakdown = app(\App\Services\FarmStatusService::class)->statusBreakdown();

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
                    // Separate key, not a replacement: the generated-report
                    // tables print 'critical_alerts' under the honest label
                    // "Readings with any critical status", while the Reports
                    // stat card wants discrete incidents. Both are correct —
                    // they answer different questions.
                    'critical_incidents' => $criticalIncidents,
                    'total_incidents'    => $totalIncidents,
                    'ammonia_incidents'  => $ammoniaIncidents,
                    'moisture_incidents' => $moistureIncidents,
                    'ongoing_incidents'  => $ongoingIncidents,
                    'resolved_incidents' => $resolvedIncidents,
                ],
                'service_summary' => [
                    'total'     => $totalServiceRequests,
                    'completed' => $completedServiceRequests,
                    'pending'   => $pendingServiceRequests,
                ],
                'completed_inspections' => $completedInspectionsList,
                'completed_services'    => $completedServicesList,
                // Super Admin Reports (Completed + Scheduled)
                'inspection_records'    => $inspectionRecordsList,
                'service_records'       => $serviceRecordsList,

                // NEW — Overview tab
                'overview_summary' => [
                    'total_farms'               => $totalFarms,
                    'total_inspections'         => $totalInspections,
                    'total_alerts'              => $totalAlerts,
                    'critical_alerts'           => $criticalIncidents,
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