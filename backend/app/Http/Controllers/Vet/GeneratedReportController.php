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
                'date_generated'  => $this->reports->generatedLabel($r->created_at, false),
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
                'date_generated' => $this->reports->generatedLabel($generatedReport->created_at),
                'snapshot'       => [
                    'vet_summary'   => $snapshot['vet_summary'] ?? [],
                    'vet_services'  => $snapshot['vet_services'] ?? [],
                    // Only the veterinary slice of the period activity block is
                    // forwarded. The rest of it counts inspections, alerts,
                    // clean-outs and odor/fly service requests, which are Admin
                    // scope and must not reach a Vet — same boundary the two keys
                    // above already enforce. Absent on snapshots archived before
                    // period_activity existed, and the report view treats it as
                    // optional.
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
