<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\GeneratedReport;
use App\Services\GeneratedReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class GeneratedReportController extends Controller
{
    public function __construct(private GeneratedReportService $reports) {}


    public function store(Request $request, \App\Http\Controllers\Admin\GeneratedReportController $admin)
    {
        return $admin->store($request);
    }

    public function destroy(GeneratedReport $generatedReport, \App\Http\Controllers\Admin\GeneratedReportController $admin)
    {
        return $admin->destroy($generatedReport);
    }

    public function index(Request $request)
    {
        $query = GeneratedReport::where('generated_by_id', Auth::id())
            ->orderByDesc('created_at')
            ->orderByDesc('id');
        \App\Support\TableQuery::validate($request);
        if ($request->filled('from')) $query->where('period_end', '>=', $request->from);
        if ($request->filled('to')) $query->where('period_start', '<=', $request->to);
        $reports = \App\Support\TableQuery::rows($query, $request)->map(fn ($r) => [
                'id' => $r->id,
                'report_name' => $r->report_name,
                'period_label' => $this->reports->periodLabel($r->period_start, $r->period_end),
                'period_start' => $r->period_start->toDateString(),
                'period_end' => $r->period_end->toDateString(),
                'report_type' => $r->report_type,
                'date_generated' => $this->reports->generatedLabel($r->created_at, false),
            ]);

        return response()->json(['success' => true, 'data' => \App\Support\TableQuery::payload($request, $reports)]);
    }

    public function show(GeneratedReport $generatedReport)
    {
        if ($generatedReport->generated_by_id !== Auth::id()) {
            abort(404);
        }

        $snapshot = $generatedReport->snapshot ?? [];

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $generatedReport->id,
                'report_name' => $generatedReport->report_name,
                'period_label' => $this->reports->periodLabel($generatedReport->period_start, $generatedReport->period_end),
                'report_type' => $generatedReport->report_type,
                'date_generated' => $this->reports->generatedLabel($generatedReport->created_at),
                'snapshot' => [
                    'reporting_version' => $snapshot['reporting_version'] ?? null,
                    'coverage' => $snapshot['coverage'] ?? null,
                    // Who prepared and who notes the report — the same two
                    // lines every other report view prints, and not Admin data.
                    'signatures' => $snapshot['signatures'] ?? null,
                    'vet_summary' => $snapshot['vet_summary'] ?? [],
                    'vet_services' => $snapshot['vet_services'] ?? [],
                    'period_activity' => isset($snapshot['period_activity'])
                        ? [
                            'vet_services_completed' => $snapshot['period_activity']['vet_services_completed'] ?? null,
                            'vet_farms_covered' => $snapshot['period_activity']['vet_farms_covered'] ?? null,
                        ]
                        : null,
                ],
            ],
        ]);
    }
}
