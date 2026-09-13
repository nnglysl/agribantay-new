<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Console\Commands\CheckMaintenanceCompliance;
use App\Console\Commands\GenerateMonthlyReport;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command(CheckMaintenanceCompliance::class)->dailyAt('08:00');
Schedule::command(GenerateMonthlyReport::class)->monthlyOn(1, '01:00');
