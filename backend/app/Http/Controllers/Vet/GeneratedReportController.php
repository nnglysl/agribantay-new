<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\GeneratedReport;
use App\Services\GeneratedReportService;

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

        return response()->json([
            'success' => true,
            'data'    => [
                'id'             => $generatedReport->id,
                'report_name'    => $generatedReport->report_name,
                'period_label'   => $this->reports->periodLabel($generatedReport->period_start, $generatedReport->period_end),
                'report_type'    => $generatedReport->report_type,
                'date_generated' => $generatedReport->created_at->format('M d, Y \a\t g:i A'),
                'snapshot'       => [
                    'vet_summary'   => $snapshot['vet_summary'] ?? [],
                    'vet_services'  => $snapshot['vet_services'] ?? [],
                ],
            ],
        ]);
    }
}
