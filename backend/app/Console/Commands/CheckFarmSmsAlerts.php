<?php

namespace App\Console\Commands;

use App\Models\Farm;
use App\Models\FarmSmsAlertState;
use App\Services\FarmStatusService;
use Illuminate\Console\Command;

class CheckFarmSmsAlerts extends Command
{
    protected $signature = 'sms-alerts:check';

    protected $description = 'Send due farm SMS reminders and retry confirmed provider rejections';

    public function handle(FarmStatusService $statusService): int
    {
        // Direct Hostinger cron calls must respect the deployment pause too.
        if ($this->laravel->isDownForMaintenance()) {
            return self::SUCCESS;
        }

        FarmSmsAlertState::where(fn ($query) => $query->whereNull('resolved_at')->orWhereNotNull('pending_token'))
            ->chunkById(100, function ($states) use ($statusService) {
                foreach ($states as $state) {
                    $farm = Farm::find($state->farm_id);
                    if ($farm) {
                        $statusService->syncSmsAlerts($farm);
                    }
                }
            });

        return self::SUCCESS;
    }
}
