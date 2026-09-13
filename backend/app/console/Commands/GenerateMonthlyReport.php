<?php

namespace App\Console\Commands;

use App\Models\GeneratedReport;
use App\Services\GeneratedReportService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Archives last month's report automatically (see routes/console.php —
 * runs on the 1st of each month). Requires the server's task scheduler
 * (cron / Windows Task Scheduler) to call `php artisan schedule:run`
 * at least once a minute; Laravel's own scheduler does not fire on its own.
 */
class GenerateMonthlyReport extends Command
{
    protected $signature = 'reports:generate-monthly';

    protected $description = 'Generate and archive the previous month\'s report snapshot';

    public function handle(GeneratedReportService $reports)
    {
        $start = Carbon::now()->subMonthNoOverflow()->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $alreadyExists = GeneratedReport::whereDate('period_start', $start->toDateString())->exists();

        if ($alreadyExists) {
            $this->info("Report for {$start->format('F Y')} already exists — skipping.");

            return;
        }

        $reportName = "{$start->format('F Y')} Report";
        $report = $reports->generateForPeriod($reportName, $start, $end);

        $this->info("Generated \"{$report->report_name}\" (id {$report->id}).");
    }
}
