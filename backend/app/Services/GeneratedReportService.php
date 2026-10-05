<?php

namespace App\Services;

use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\GeneratedReport;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Support\LocalTime;
use App\Support\ServiceTypes;
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

    private const VET_SERVICE_TYPES = ServiceTypes::VET;

    /**
     * $reportType is the PERIOD kind the user chose — Daily, Weekly, Monthly
     * or Custom. The column used to be filled with the literal 'PDF', which
     * described the export format rather than the report, so the Generated
     * Reports list had no way to say what kind of period a row covered.
     * Monthly is the default because the console archive is the only caller
     * that does not pass one.
     */
    public function generateForPeriod(string $reportName, Carbon $start, Carbon $end, ?int $generatedById = null, string $reportType = 'Monthly'): GeneratedReport
    {
        return GeneratedReport::create([
            'report_name' => $reportName,
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'report_type' => $reportType,
            'generated_by_id' => $generatedById,
            'snapshot' => array_merge(
                $this->buildSnapshot($start, $end),
                ['signatures' => $this->signatureBlock($generatedById)]
            ),
        ]);
    }

    /**
     * The two names printed under the report, captured AS TEXT at the moment
     * it is generated.
     *
     * Deliberately not a lookup at view time. generated_by_id is SET NULL when
     * a user is removed, so resolving the name later would blank the
     * "Prepared by" line on every report that person ever produced — an
     * official document that quietly loses its author. A snapshot has to be
     * complete on its own, so the names are frozen with the figures.
     */
    private function signatureBlock(?int $generatedById): array
    {
        $titles = [
            'vet' => 'Municipal Veterinarian',
            'super_admin' => 'Head, Agriculture Office',
            'admin' => 'LGU Staff',
        ];

        $preparedBy = $generatedById ? User::find($generatedById) : null;

        // The Head signs off on every report, whoever produced it. Taken from
        // the Super Admin account rather than written into the view, so the
        // name is never hardcoded — and frozen here for the same reason as
        // above.
        $head = User::where('role', 'super_admin')->orderBy('id')->first();

        // When the Head generates the report himself, there is nobody else to
        // note it: both lines would carry the same name and the same title,
        // and a document signed twice by one person reads as a mistake. Only
        // the Head's line is printed.
        if ($preparedBy && $preparedBy->role === 'super_admin') {
            return [
                'prepared_by' => null,
                'noted_by' => [
                    'name' => trim($preparedBy->first_name.' '.$preparedBy->last_name),
                    'title' => 'Head, Agriculture Office',
                ],
            ];
        }

        return [
            'prepared_by' => [
                'name' => $preparedBy ? trim($preparedBy->first_name.' '.$preparedBy->last_name) : null,
                'title' => $preparedBy ? ($titles[$preparedBy->role] ?? 'LGU Staff') : null,
            ],
            'noted_by' => [
                'name' => $head ? trim($head->first_name.' '.$head->last_name) : null,
                'title' => 'Head, Agriculture Office',
            ],
        ];
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
        $moistureBreaches = SensorReading::where('moisture_status', 'Critical')->count();

        // Only the metrics the system actually alerts on
        // (config('sensors.alerting_metrics')). Two things were wrong before:
        //
        //   moisture_status was missing entirely, so a reading whose only
        //   Critical metric was manure moisture was not counted at all — the
        //   same omission already corrected in AdminReportController.
        //
        //   temperature and humidity WERE counted, and they dominated the
        //   figure: their safe bands come from temperate-climate studies that
        //   do not hold in a San Jose layer house, so nearly every reading sat
        //   outside them. The report printed ~13,000 "critical" readings a few
        //   lines above an alert table listing a handful of incidents, and the
        //   two contradicted each other on the same page.
        $criticalAlerts = SensorReading::where(function ($q) {
            $q->where('ammonia_status', 'Critical')
                ->orWhere('moisture_status', 'Critical');
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

        $alertRows = AlertHistory::with('farm')
            ->whereBetween('triggered_at', [$from, $to])
            ->latest('triggered_at')
            ->get();

        $alertRecordsList = $alertRows
            ->map(fn ($a) => [
                'farm_name' => $a->farm->farm_name ?? '—',
                'owner_name' => $a->farm->owner_name ?? '—',
                'sensor_type' => $a->sensor_type,
                'status' => $a->status,
                'triggered_at' => LocalTime::dateTime($a->triggered_at),
                'resolved_at' => LocalTime::dateTime($a->resolved_at),
            ])
            ->values();

        // One row per FARM rather than one per incident. The detail list is
        // kept in the snapshot (older archives are frozen and still render
        // from it), but the printed report shows this instead: 81 incidents
        // ran to six pages of rows that answered no question a reader has.
        // Three rows answer the real one — which farm, and what kind.
        //
        // Deliberately no "Ongoing" column. The snapshot never changes, so
        // an incident ongoing on 1 October still prints as ongoing in
        // December, long after it was resolved.
        // Resolution state is read from the RAW rows, not from $alertRecordsList,
        // whose resolved_at has already been formatted for display.
        $alertRowsByFarm = $alertRows->groupBy(fn ($a) => $a->farm->farm_name ?? '—');

        $alertFarmSummary = $alertRecordsList
            ->groupBy('farm_name')
            ->map(fn ($rows, $farmName) => [
                'farm_name' => $farmName,
                'owner_name' => $rows->first()['owner_name'] ?? '—',
                'ammonia' => $rows->where('sensor_type', 'ammonia')->count(),
                'moisture' => $rows->where('sensor_type', 'moisture')->count(),
                'critical' => $rows->where('status', 'Critical')->count(),
                'warning' => $rows->where('status', 'Warning')->count(),
                // Resolved/ongoing AS OF THE END OF THE PERIOD, never as of
                // today. This is what makes the pair safe to freeze: an
                // incident still open on 30 September is reported as ongoing in
                // the September report for good, which is the true statement
                // about September. Reading it as "open right now" was the trap
                // that kept this column out before, and the fix is the cutoff,
                // not the omission — the report view labels it accordingly.
                'resolved' => ($alertRowsByFarm[$farmName] ?? collect())
                    ->filter(fn ($a) => $a->resolved_at && $a->resolved_at <= $to)->count(),
                'ongoing' => ($alertRowsByFarm[$farmName] ?? collect())
                    ->filter(fn ($a) => ! $a->resolved_at || $a->resolved_at > $to)->count(),
                'total' => $rows->count(),
            ])
            // Worst first — the farm needing attention is the first one read.
            ->sortByDesc('total')
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

        // ------------------------------------------------------------------
        // PERIOD-SCOPED FIGURES
        //
        // Everything below answers "what happened during the selected period",
        // which is what the report claims to be about. The older summaries a
        // few blocks up are whole-database counts with no date filter at all:
        // a September report was printing the all-time inspection, alert and
        // service-request totals beside period-filtered tables, and the two
        // disagreed on the same page. Those keys are left exactly as they were
        // so reports archived before today keep rendering, and the report views
        // prefer the keys below whenever a snapshot carries them.
        // ------------------------------------------------------------------

        // New accounts, by the role values the system actually stores. A user
        // counts only if their own created_at falls inside the window — never
        // the standing total, which is what "new users" must not mean.
        $newAccountsByRole = User::whereBetween('created_at', [$from, $to])
            ->selectRaw('role, COUNT(*) as n')
            ->groupBy('role')
            ->pluck('n', 'role');

        $newAccounts = [
            'farm_owners' => (int) ($newAccountsByRole['farm_owner'] ?? 0),
            'staff' => (int) ($newAccountsByRole['admin'] ?? 0),
            'vets' => (int) ($newAccountsByRole['vet'] ?? 0),
            'super_admins' => (int) ($newAccountsByRole['super_admin'] ?? 0),
            'total' => (int) $newAccountsByRole->sum(),
        ];

        $newFarmsList = Farm::whereBetween('created_at', [$from, $to])
            ->latest('created_at')
            ->get()
            ->map(fn ($f) => [
                'farm_name' => $f->farm_name,
                'owner_name' => $f->owner_name,
                'barangay' => $f->barangay,
                // Size is not decoration here: it sets the clean-out interval
                // (Small 365 days, Medium 270, Large 180), so it is what decides
                // when each of these farms first falls due in the Compliance
                // section further down the same report.
                'farm_size' => $f->farm_size,
                'registered_at' => LocalTime::date($f->created_at),
            ])
            ->values();

        // Devices are counted from the device record's own created_at — the
        // moment it was registered. Not installed_at, which is a nullable date
        // the registrar types in and may back-date, and emphatically not sensor
        // readings, which are traffic from a device rather than a new one.
        $newDevicesList = Sensor::with('farm')
            ->whereBetween('created_at', [$from, $to])
            ->latest('created_at')
            ->get()
            ->map(fn ($d) => [
                'device' => $d->label ?: ($d->sensor_code ?? '—'),
                'sensor_code' => $d->sensor_code,
                'farm_name' => $d->farm->farm_name ?? 'Unassigned',
                'registered_at' => LocalTime::date($d->created_at),
            ])
            ->values();

        // Inspections are placed in the period by scheduled_at — the date the
        // visit belongs to. Anchoring on completed_at instead would drop every
        // inspection that was scheduled in the period and not yet carried out,
        // which is exactly the backlog the reader is looking for.
        $periodInspections = Inspection::with('farm')
            ->whereBetween('scheduled_at', [$from, $to])
            ->get();

        // 'Overdue' is NOT a stored status — inspections are Scheduled,
        // Completed or Cancelled. It is derived: still Scheduled, with its date
        // already past. Derived here rather than added to the enum so
        // inspection scheduling itself is untouched.
        //
        // The cutoff is the EARLIER of the period end and now. Measuring
        // against the period end alone calls a visit booked for the 20th
        // overdue in a report run on the 4th, because the 20th is before the
        // month ends — a date that has not arrived yet cannot have been missed.
        // For a period that already closed the two are the same, and the figure
        // is unchanged.
        $overdueCutoff = $to->lessThan(now()) ? $to : now();

        $isOverdue = fn ($i) => $i->status === 'Scheduled' && $i->scheduled_at < $overdueCutoff;

        $overdueInspections = $periodInspections->filter($isOverdue)->count();

        $inspectionPeriod = [
            'total' => $periodInspections->count(),
            'scheduled' => $periodInspections->where('status', 'Scheduled')->count(),
            'completed' => $periodInspections->where('status', 'Completed')->count(),
            'cancelled' => $periodInspections->where('status', 'Cancelled')->count(),
            'overdue' => $overdueInspections,
        ];

        $inspectionFarmSummary = $periodInspections
            ->groupBy(fn ($i) => $i->farm->farm_name ?? '—')
            ->map(fn ($rows, $farmName) => [
                'farm_name' => $farmName,
                'scheduled' => $rows->where('status', 'Scheduled')->count(),
                'completed' => $rows->where('status', 'Completed')->count(),
                'cancelled' => $rows->where('status', 'Cancelled')->count(),
                'overdue' => $rows->filter($isOverdue)->count(),
                'total' => $rows->count(),
            ])
            ->sortByDesc('total')
            ->values();

        // Service requests are placed by created_at, the date the farmer asked.
        // Every type is counted, admin and veterinary alike: this is the
        // municipality-wide figure, and the existing admin-only and vet-only
        // summaries are still reported separately beside it.
        //
        // The four statuses are the enum's own — Pending, Scheduled, Completed,
        // Cancelled. No status is invented, and none is renamed: the report
        // says what the workflow says.
        $periodServiceRequests = ServiceRequest::whereBetween('created_at', [$from, $to])->get();

        $serviceRequestPeriod = [
            'total' => $periodServiceRequests->count(),
            'pending' => $periodServiceRequests->where('status', 'Pending')->count(),
            'scheduled' => $periodServiceRequests->where('status', 'Scheduled')->count(),
            'completed' => $periodServiceRequests->where('status', 'Completed')->count(),
            'cancelled' => $periodServiceRequests->where('status', 'Cancelled')->count(),
        ];

        // Counted off the same rows the farm table and the detail list are
        // built from, so the overall figure can never disagree with the rows
        // beneath it.
        $alertPeriod = [
            'total' => $alertRows->count(),
            'critical' => $alertRows->where('status', 'Critical')->count(),
            'warning' => $alertRows->where('status', 'Warning')->count(),
            'resolved' => $alertRows->filter(fn ($a) => $a->resolved_at && $a->resolved_at <= $to)->count(),
            'ongoing' => $alertRows->filter(fn ($a) => ! $a->resolved_at || $a->resolved_at > $to)->count(),
        ];

        // Compliance is a position at the cutoff, not activity during the
        // period, and is labelled that way in the report. Taken from the same
        // $maintenanceStatuses the overdue table is built from — the existing
        // MaintenanceStatusService, not a second opinion about compliance.
        $compliancePeriod = [
            'compliant' => $maintenanceStatuses->where('status', 'Compliant')->count(),
            'overdue' => $maintenanceStatuses->where('status', 'Overdue')->count(),
            'non_compliant' => $maintenanceStatuses->where('status', 'Non-Compliant')->count(),
            'total_farms' => $maintenanceStatuses->count(),
        ];

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
                // Its presence is also how the printed view tells a new
                // snapshot from one archived before this section was
                // corrected; older reports keep printing their own figures.
                'moisture_breaches' => $moistureBreaches,
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
            // Period-scoped blocks. Their PRESENCE is how a report view tells a
            // snapshot built today from one archived earlier: an older archive
            // simply has no such key and keeps printing the figures it froze.
            'new_accounts' => $newAccounts,
            'new_farms' => [
                'count' => $newFarmsList->count(),
                'list' => $newFarmsList,
            ],
            'new_devices' => [
                'count' => $newDevicesList->count(),
                'list' => $newDevicesList,
            ],
            'inspection_period' => $inspectionPeriod,
            'inspection_farm_summary' => $inspectionFarmSummary,
            'service_request_period' => $serviceRequestPeriod,
            'alert_period' => $alertPeriod,
            'compliance_period' => $compliancePeriod,
            'completed_inspections' => $completedInspectionsList,
            'alert_records' => $alertRecordsList,
            'alert_farm_summary' => $alertFarmSummary,
            'maintenance_overdue' => $maintenanceOverdueList,
            'maintenance_completed' => $maintenanceCompletedList,
            'completed_services' => $completedServicesList,
            'vet_services' => $vetServicesList,
        ];
    }
}
