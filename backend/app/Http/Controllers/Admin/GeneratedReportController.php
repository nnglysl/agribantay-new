<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\GeneratedReport;
use App\Services\GeneratedReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use App\Support\LocalTime;

class GeneratedReportController extends Controller
{
    public function __construct(private GeneratedReportService $reports)
    {
    }

    public function index()
    {
        $reports = GeneratedReport::orderByDesc('period_start')
            ->get()
            ->map(fn($r) => [
                'id'              => $r->id,
                'report_name'     => $r->report_name,
                'period_label'    => $this->reports->periodLabel($r->period_start, $r->period_end),
                'period_start'    => $r->period_start->toDateString(),
                'report_type'     => $r->report_type,
                'date_generated'  => $this->reports->generatedLabel($r->created_at, false),
            ]);

        return response()->json(['success' => true, 'data' => $reports]);
    }

    public function show(GeneratedReport $generatedReport)
    {
        $snapshot = $generatedReport->snapshot ?? [];

        // A regular Admin's own live Reports page never fetches or shows
        // Vet-scoped data (see Admin\ReportController — no vet_summary /
        // vet_services there at all); the archived report's View/Print/
        // Export must match that same authorized scope. Super Admin's live
        // Reports page legitimately combines Admin + Vet data, so it alone
        // keeps the full snapshot.
        if (Auth::user()?->role !== 'super_admin') {
            unset($snapshot['vet_summary'], $snapshot['vet_services']);

            // period_activity carries the veterinary counts alongside the Admin
            // ones, so the same boundary has to be applied inside it — otherwise
            // stripping the two keys above would be undone by this block.
            unset(
                $snapshot['period_activity']['vet_services_completed'],
                $snapshot['period_activity']['vet_farms_covered'],
            );
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'id'             => $generatedReport->id,
                'report_name'    => $generatedReport->report_name,
                'period_label'   => $this->reports->periodLabel($generatedReport->period_start, $generatedReport->period_end),
                'report_type'    => $generatedReport->report_type,
                'date_generated' => $this->reports->generatedLabel($generatedReport->created_at),
                'snapshot'       => $snapshot,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'report_name'  => 'required|string|max:255',
            'period_start' => 'required|date',
            'period_end'   => 'required|date|after_or_equal:period_start',
        ]);

        // The submitted dates are Philippine calendar dates, so the period runs
        // from local midnight to local 23:59:59 — not UTC midnight.
        $start = LocalTime::startOfLocalDay($validated['period_start']);
        $end   = LocalTime::endOfLocalDay($validated['period_end']);

        // A generated report is a frozen snapshot presented as a finalised
        // archive ("Automatically archived on the 1st of each month"), so it must
        // not be created while its own period is still running — that produces a
        // document headed "September 1-30" holding only part of September, which
        // is how report id 2 came to exist. There is no interim/preliminary report
        // concept in the schema or the UI, so the period must simply be complete.
        //
        // "Has the period ended?" is a question about the office's calendar, not
        // UTC's, so it is asked in the office timezone. Snapshot filtering is left
        // on the application clock exactly as before.
        $officeNow = Carbon::now(LocalTime::timezone());
        $periodEndLocal = Carbon::parse($validated['period_end'], LocalTime::timezone())->endOfDay();

        if ($periodEndLocal->isAfter($officeNow)) {
            return response()->json([
                'success' => false,
                'message' => 'The reporting period has not ended yet. A monthly archive can only be generated once its period is complete (this one ends '
                    .$periodEndLocal->format('M d, Y').').',
            ], 422);
        }

        // Never silently overwrite or duplicate an existing archive. Regenerating
        // a month is a deliberate act: the existing record has to be removed first.
        $existing = GeneratedReport::whereDate('period_start', $start->toDateString())
            ->whereDate('period_end', $end->toDateString())
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'A report for this period already exists ("'.$existing->report_name.'", id '.$existing->id
                    .'). Existing archives are never overwritten.',
                'data'    => ['id' => $existing->id],
            ], 409);
        }

        $report = $this->reports->generateForPeriod(
            $validated['report_name'],
            $start,
            $end,
            $request->user()?->id
        );

        return response()->json(['success' => true, 'data' => ['id' => $report->id]], 201);
    }
}
