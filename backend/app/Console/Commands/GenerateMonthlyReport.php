<?php

namespace App\Console\Commands;

use App\Models\GeneratedReport;
use App\Services\GeneratedReportService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use App\Support\LocalTime;

class GenerateMonthlyReport extends Command
{
    protected $signature = 'reports:generate-monthly';

    protected $description = 'Generate and archive the previous month\'s report snapshot';

    public function handle(GeneratedReportService $reports): int
    {
        $start = Carbon::now(LocalTime::timezone())->subMonthNoOverflow()->startOfMonth();
        $end = $start->copy()->endOfMonth();

        if ($end->isFuture()) {
            $this->error("Refusing to archive {$start->format('F Y')}: the period does not end until {$end->format('M d, Y')}.");

            return self::FAILURE;
        }

        $alreadyExists = GeneratedReport::whereDate('period_start', $start->toDateString())->exists();

        if ($alreadyExists) {
            $this->info("Report for {$start->format('F Y')} already exists — skipping.");

            return self::SUCCESS;
        }

        $reportName = "{$start->format('F Y')} Report";
        $report = $reports->generateForPeriod($reportName, $start, $end);

        $this->info("Generated \"{$report->report_name}\" (id {$report->id}).");

        return self::SUCCESS;
    }
}
