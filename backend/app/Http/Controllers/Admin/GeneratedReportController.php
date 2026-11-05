<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\GeneratedReport;
use App\Models\User;
use App\Services\GeneratedReportService;
use App\Support\LocalTime;
use App\Support\TableQuery;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class GeneratedReportController extends Controller
{
    public function __construct(private GeneratedReportService $reports) {}

    public function index(Request $request)
    {
        $query = GeneratedReport::where('generated_by_id', Auth::id())
            ->orderByDesc('created_at')
            ->orderByDesc('id');
        TableQuery::validate($request);
        if ($request->filled('from')) {
            $query->where('period_end', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->where('period_start', '<=', $request->to);
        }
        $reports = TableQuery::rows($query, $request)->map(fn ($r) => [
            'id' => $r->id,
            'report_name' => $r->report_name,
            'period_label' => $this->reports->periodLabel($r->period_start, $r->period_end),
            'period_start' => $r->period_start->toDateString(),
            'period_end' => $r->period_end->toDateString(),
            'report_type' => $r->report_type,
            'date_generated' => $this->reports->generatedLabel($r->created_at, false),
        ]);

        return response()->json(['success' => true, 'data' => TableQuery::payload($request, $reports)]);
    }

    public function destroy(GeneratedReport $generatedReport)
    {
        if ($generatedReport->generated_by_id !== Auth::id()) {
            abort(404);
        }

        $name = $generatedReport->report_name;
        $period = $this->reports->periodLabel($generatedReport->period_start, $generatedReport->period_end);

        $generatedReport->delete();

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
        if ($generatedReport->generated_by_id !== Auth::id()) {
            abort(404);
        }

        $snapshot = $generatedReport->snapshot ?? [];

        if (Auth::user()?->role !== 'super_admin') {
            unset($snapshot['vet_summary'], $snapshot['vet_services']);

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

        $start = LocalTime::startOfLocalDay($validated['period_start']);
        $end = LocalTime::endOfLocalDay($validated['period_end']);

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

        return DB::transaction(function () use ($request, $validated, $start, $end) {

            $actor = User::whereKey(Auth::id())->lockForUpdate()->firstOrFail();
            abort_unless($actor->status === 'active' && $actor->role === $request->user()->role, 403);
            $existing = GeneratedReport::where('generated_by_id', $actor->id)
                ->whereDate('period_start', $start->toDateString())
                ->whereDate('period_end', $end->toDateString())
                ->first();

            if ($existing) {
                return response()->json([
                    'success' => false,
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

            return response()->json(['success' => true, 'data' => ['id' => $report->id, 'report_name' => $report->report_name]], 201);
        });
    }
}
