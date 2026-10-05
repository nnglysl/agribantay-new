<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Console\Commands\CheckMaintenanceCompliance;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command(CheckMaintenanceCompliance::class)->dailyAt('08:00');
// Reports are generated on demand: the user picks the period on the Reports
// page and presses Generate. The monthly archive used to be scheduled here,
// which on shared hosting with no cron simply meant no report was ever
// produced — September 2026 had none for exactly that reason. The command
// itself is kept and can still be run by hand, but nothing schedules it.
// GenerateMonthlyReport is intentionally no longer scheduled.
