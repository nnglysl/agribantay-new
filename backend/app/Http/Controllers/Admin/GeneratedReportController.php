<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\GeneratedReport;
use App\Services\GeneratedReportService;
use App\Support\LocalTime;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

class GeneratedReportController extends Controller
{
    public function __construct(private GeneratedReportService $reports) {}

    public function index()
    {
        // Newest GENERATED first: with on-demand generation a user may well
        // create September after October, and the row they just made has to be
        // the one at the top. id breaks ties, because created_at only has
        // second granularity and two reports made in the same second would
        // otherwise come back in an arbitrary order.
        // Each person sees only the archives they generated themselves.
        // One table backs every module, so without this the report a staff
        // member produced also appeared in the Vet's list and vice versa —
        // one document showing up in three places as though three existed.
        //
        // Safe as an ownership rule because generator accounts are never
        // deleted (admin/vet/super_admin can only be deactivated), so an
        // archive can never be orphaned beyond reach.
        $reports = GeneratedReport::where('generated_by_id', Auth::id())
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn ($r) => [
                'id' => $r->id,
                'report_name' => $r->report_name,
                'period_label' => $this->reports->periodLabel($r->period_start, $r->period_end),
                'period_start' => $r->period_start->toDateString(),
                'period_end' => $r->period_end->toDateString(),
                'report_type' => $r->report_type,
                'date_generated' => $this->reports->generatedLabel($r->created_at, false),
            ]);

        return response()->json(['success' => true, 'data' => $reports]);
    }

    /**
     * Remove one archived report.
     *
     * The archive is deliberately append-only on generation — store() refuses
     * to overwrite an existing period — which leaves deleting as the one way to
     * redo a period after a correction. Without it the refusal is a dead end.
     *
     * Same ownership rule as index() and show(): a person may remove the
     * reports they generated and no others, and an id belonging to someone else
     * 404s rather than 403s so this never confirms that their report exists.
     *
     * What is destroyed is a DERIVED document — a frozen copy of figures that
     * can be generated again from records that are not touched here. No farm,
     * inspection, alert or service request is affected.
     */
    public function destroy(GeneratedReport $generatedReport)
    {
        if ($generatedReport->generated_by_id !== Auth::id()) {
            abort(404);
        }

        $name = $generatedReport->report_name;
        $period = $this->reports->periodLabel($generatedReport->period_start, $generatedReport->period_end);

        $generatedReport->delete();

        // Written by hand, as every mutating action in this codebase is: there
        // is no observer layer, and an official archive disappearing with no
        // trace of who removed it is exactly what the Activity Log is for.
        ActivityLog::create([
            'user_id' => Auth::id(),
            'role' => Auth::user()?->role,
            'action' => 'Deleted Generated Report',
            'details' => $name.' — '.$period,
            'type' => 'System',
        ]);

        return response()->json([
            'success' => true,
            'message' => '"'.$name.'" has been deleted. The period can be generated again.',
        ]);
    }

    public function show(GeneratedReport $generatedReport)
    {
        // Same ownership rule as the list — otherwise the id could simply be
        // typed into the URL. 404 rather than 403 so this does not confirm
        // that someone else's report exists.
        if ($generatedReport->generated_by_id !== Auth::id()) {
            abort(404);
        }

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
            'data' => [
                'id' => $generatedReport->id,
                'report_name' => $generatedReport->report_name,
                'period_label' => $this->reports->periodLabel($generatedReport->period_start, $generatedReport->period_end),
                'report_type' => $generatedReport->report_type,
                'date_generated' => $this->reports->generatedLabel($generatedReport->created_at),
                'snapshot' => $snapshot,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'report_name' => 'required|string|max:255',
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
            'report_type' => 'required|in:Daily,Weekly,Monthly,Custom',
        ], [
            'period_end.after_or_equal' => 'The end date cannot be before the start date.',
            'report_type.in' => 'Choose Daily, Weekly, Monthly or a Custom range.',
        ]);

        // The submitted dates are Philippine calendar dates, so the period runs
        // from local midnight to local 23:59:59 — not UTC midnight.
        $start = LocalTime::startOfLocalDay($validated['period_start']);
        $end = LocalTime::endOfLocalDay($validated['period_end']);

        // Reports are generated on demand, so a period that is still running
        // is a legitimate thing to ask for — "today's" daily report is the
        // obvious case. What must never happen is a document HEADED a period
        // it does not actually cover: that is how a report titled
        // "September 1-30" came to hold only part of September.
        //
        // So the end is clamped to today rather than refused. The stored
        // period then states exactly what the figures cover, and the title the
        // user sees is built from it. "Has it ended?" is a question about the
        // office calendar, so it is asked in the office timezone.
        $officeToday = Carbon::now(LocalTime::timezone())->startOfDay();
        $requestedEnd = Carbon::parse($validated['period_end'], LocalTime::timezone())->startOfDay();

        if ($requestedEnd->isAfter($officeToday)) {
            $end = LocalTime::endOfLocalDay($officeToday->toDateString());
        }

        // A period that has not begun has nothing to report at all.
        if (Carbon::parse($validated['period_start'], LocalTime::timezone())->startOfDay()->isAfter($officeToday)) {
            return response()->json([
                'success' => false,
                'message' => 'That reporting period has not started yet.',
            ], 422);
        }

        // Never silently overwrite or duplicate an existing archive. Regenerating
        // a month is a deliberate act: the existing record has to be removed first.
        //
        // Scoped to the person generating, exactly like index() and show().
        // Without the scope this check reached across modules: the Vet, who
        // had generated nothing, was told that "September 2026 Report, id 210"
        // already existed and was blocked — by a staff member's archive the
        // Vet cannot see, open or delete. Each module keeps its own archive,
        // so "already exists" has to mean "exists in yours".
        $existing = GeneratedReport::where('generated_by_id', Auth::id())
            ->whereDate('period_start', $start->toDateString())
            ->whereDate('period_end', $end->toDateString())
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                // The period is named rather than the row id: the reader is
                // looking at a list of reports by name and period, and "id 215"
                // is not something that list shows or that they can act on. The
                // period is also what the clash is actually ABOUT — especially
                // when the month is still running and the stored period is
                // shorter than the month asked for. The id stays in `data` for
                // the frontend.
                'message' => 'A report covering '.$this->reports->periodLabel($start, $end)
                    .' already exists ("'.$existing->report_name.'"). Delete it first if you need to generate it again — existing archives are never overwritten.',
                'data' => ['id' => $existing->id],
            ], 409);
        }

        $report = $this->reports->generateForPeriod(
            $validated['report_name'],
            $start,
            $end,
            $request->user()?->id,
            $validated['report_type']
        );

        return response()->json(['success' => true, 'data' => ['id' => $report->id]], 201);
    }
}
