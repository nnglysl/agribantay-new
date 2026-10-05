<?php

namespace App\Console\Commands;

use App\Models\GeneratedReport;
use App\Services\GeneratedReportService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use App\Support\LocalTime;

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

    public function handle(GeneratedReportService $reports): int
    {
        // The month is a PHILIPPINE calendar month. Deriving it from UTC "now"
        // would pick the wrong month for eight hours around each boundary, and
        // would bound the period on the UTC day rather than the local one.
        $start = Carbon::now(LocalTime::timezone())->subMonthNoOverflow()->startOfMonth();
        $end = $start->copy()->endOfMonth();

        // Defensive: an archived monthly report is a finalised record, so it must
        // never cover a period that is still running. Targeting the previous month
        // already guarantees this, but the guard makes the invariant explicit and
        // fails loudly rather than silently archiving a partial month if the date
        // arithmetic above is ever changed.
        if ($end->isFuture()) {
            $this->error("Refusing to archive {$start->format('F Y')}: the period does not end until {$end->format('M d, Y')}.");

            return self::FAILURE;
        }

        // Idempotent: the scheduler may fire more than once (retries, a manual run,
        // a catch-up after downtime) and must not archive the same month twice.
        // Existing archives are left untouched — never overwritten.
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
