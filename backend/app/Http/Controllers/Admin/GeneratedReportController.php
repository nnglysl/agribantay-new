<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\GeneratedReport;
use App\Services\GeneratedReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

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
                'date_generated'  => $r->created_at->format('M d, Y'),
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
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'id'             => $generatedReport->id,
                'report_name'    => $generatedReport->report_name,
                'period_label'   => $this->reports->periodLabel($generatedReport->period_start, $generatedReport->period_end),
                'report_type'    => $generatedReport->report_type,
                'date_generated' => $generatedReport->created_at->format('M d, Y \a\t g:i A'),
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

        $start = Carbon::parse($validated['period_start'])->startOfDay();
        $end   = Carbon::parse($validated['period_end'])->endOfDay();

        $report = $this->reports->generateForPeriod(
            $validated['report_name'],
            $start,
            $end,
            $request->user()?->id
        );

        return response()->json(['success' => true, 'data' => ['id' => $report->id]], 201);
    }
}
