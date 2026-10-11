<?php

namespace App\Console\Commands;

use App\Services\FarmSmsAlertService;
use App\Services\SmsService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class ReconcileFarmSmsAlert extends Command
{
    protected $signature = 'sms-alerts:reconcile {farm_id} {token} {outcome : accepted or rejected, verified with UniSMS} {--accepted-at= : Provider acceptance time in UTC}';

    protected $description = 'Reconcile an uncertain farm alert SMS after checking its token with UniSMS';

    public function handle(FarmSmsAlertService $alerts): int
    {
        $outcome = $this->argument('outcome');
        if (! in_array($outcome, [SmsService::ACCEPTED, SmsService::REJECTED], true)
            || ($outcome === SmsService::ACCEPTED && ! $this->option('accepted-at'))) {
            $this->error('Use accepted with --accepted-at (UTC), or rejected after verifying the request was not accepted.');

            return self::FAILURE;
        }
        try {
            $timestamp = $outcome === SmsService::ACCEPTED
                ? Carbon::parse($this->option('accepted-at'), 'UTC')->utc() : now();
        } catch (\Exception) {
            $this->error('Invalid provider acceptance time.');

            return self::FAILURE;
        }
        if ($timestamp->gt(now())) {
            $this->error('Provider acceptance time cannot be in the future.');

            return self::FAILURE;
        }
        if (! $alerts->reconcile((int) $this->argument('farm_id'), $this->argument('token'), $outcome, $timestamp)) {
            $this->error('No matching uncertain SMS, or its request is still in flight.');

            return self::FAILURE;
        }
        $this->info('SMS tracking reconciled. No SMS was sent by this command.');

        return self::SUCCESS;
    }
}
