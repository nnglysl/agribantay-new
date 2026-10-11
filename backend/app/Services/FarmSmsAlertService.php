<?php

namespace App\Services;

use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\FarmSmsAlertState;
use App\Models\SensorReading;
use App\Models\SmsLog;
use App\Support\LocalTime;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class FarmSmsAlertService
{
    public function __construct(private SmsService $sms) {}

    /** The resolver uses the existing farm status calculation under the lock. */
    public function sync(Farm $farm, callable $resolveStatus): void
    {
        $token = DB::transaction(function () use ($farm, $resolveStatus) {
            // Lock an existing farm before creating its unique state row.
            // This also serializes first-time processing by multiple workers.
            $lockedFarm = Farm::whereKey($farm->id)->lockForUpdate()->first();
            if (! $lockedFarm) {
                return null;
            }

            $deviceIds = $lockedFarm->sensors()->where('status', 'Active')->pluck('id');
            if ($deviceIds->isEmpty()) {
                return null;
            }

            $reading = SensorReading::where('farm_id', $farm->id)
                ->whereIn('sensor_id', $deviceIds)->latest('id')->first();
            // An old Critical reading on an offline or rotated device does
            // not prove that the farm is still Critical now.
            if (! $reading || $reading->created_at->lte(now()->subMinutes(config('sensors.offline_after_minutes', 3)))) {
                return null;
            }

            $status = $resolveStatus($lockedFarm);
            if (! in_array($status, ['Safe', 'Warning', 'Critical'], true)) {
                return null;
            }

            $state = FarmSmsAlertState::where('farm_id', $farm->id)->first();
            if (! $state) {
                $state = new FarmSmsAlertState(['farm_id' => $farm->id, 'safe_readings_count' => 0]);
                $this->bootstrap($state, $lockedFarm, $status, $reading, $deviceIds->all());
            }

            $this->recoverPending($state);
            $isNewReading = $state->last_reading_id === null || $reading->id > $state->last_reading_id;
            $previousAbnormal = $state->last_abnormal_status;

            if ($isNewReading) {
                $state->last_reading_id = $reading->id;
                $state->observed_status = $status;

                if ($status !== 'Safe') {
                    if (! $state->incident_started_at || $state->resolved_at) {
                        $state->incident_token = (string) Str::uuid();
                        $state->incident_started_at = now();
                        $state->resolved_at = null;
                        $state->last_critical_sent_at = null;
                        $state->last_warning_sent_at = null;
                        $state->last_recovery_sent_at = null;
                        if ($state->pending_outcome !== 'sending') {
                            $this->clearPending($state);
                        }
                    }
                    $state->safe_readings_count = 0;
                    $state->last_abnormal_status = $status;
                } elseif ($state->incident_started_at && ! $state->resolved_at) {
                    $state->safe_readings_count = min(
                        AlertHistoryService::RESOLVE_AFTER_CONSECUTIVE_SAFE_READINGS,
                        $state->safe_readings_count + 1
                    );
                    // Concurrent ingests may have already persisted all three
                    // Safe readings before this worker observes the newest ID.
                    // Reuse the history's confirmed streak instead of requiring
                    // three additional sync calls after history has recovered.
                    $confirmedHistory = AlertHistory::where('farm_id', $farm->id)
                        ->whereIn('sensor_type', config('sensors.alerting_metrics', ['ammonia']))
                        ->where(fn ($query) => $query->whereNull('sensor_id')->orWhereIn('sensor_id', $deviceIds))
                        ->where('resolved_at', '>=', $state->incident_started_at->copy()->startOfSecond())
                        ->where('safe_readings_count', '>=', AlertHistoryService::RESOLVE_AFTER_CONSECUTIVE_SAFE_READINGS)
                        ->exists();
                    if ($confirmedHistory) {
                        $state->safe_readings_count = AlertHistoryService::RESOLVE_AFTER_CONSECUTIVE_SAFE_READINGS;
                    }
                    // Both gates matter: duplicate read-side syncs cannot
                    // manufacture recovery, and a different house or a faulty
                    // moisture probe cannot close a still-open history row.
                    if ($state->safe_readings_count >= AlertHistoryService::RESOLVE_AFTER_CONSECUTIVE_SAFE_READINGS
                        && ! $this->openIncidents($farm->id, $deviceIds->all())->exists()) {
                        $state->resolved_at = now();
                        $state->last_abnormal_status = null;
                        if ($state->pending_outcome !== 'sending') {
                            $this->clearPending($state);
                        }
                    }
                }
            }

            // Immediately stop reminders on any improvement, while keeping
            // the episode and its successful Critical clock through Safe blips.
            if (in_array($state->pending_outcome, ['reserved', SmsService::REJECTED], true)
                && $state->pending_status !== $status) {
                $this->clearPending($state);
            }
            // A failed/uncertain Warning must not block a Critical escalation.
            if ($status === 'Critical' && $state->pending_status === 'Warning'
                && $state->pending_outcome !== 'sending') {
                $this->clearPending($state);
            }

            if ($state->pending_outcome === 'reserved') {
                $state->save();

                return $state->pending_token;
            }
            if (in_array($state->pending_outcome, ['sending', SmsService::UNKNOWN], true)
                || ($state->retry_after && $state->retry_after->gt(now()))) {
                $state->save();

                return null;
            }

            $send = false;
            if ($status === 'Critical') {
                // The first Critical of an episode is immediate, including
                // escalation from Warning. Later flips cannot repeat the same
                // Critical notification inside one farm-visit period.
                $send = $state->last_critical_sent_at === null
                    || (! $this->notifiedInCurrentPeriod($state->last_critical_sent_at)
                        && $this->repeatGapElapsed($state->last_critical_sent_at)
                        && (($isNewReading && $previousAbnormal === 'Warning') || $this->inReminderWindow()));
            } elseif ($status === 'Warning') {
                // Warning is transition-only. Bound repeat flips by both the
                // existing cooldown and the current farm-visit period.
                $send = ($state->last_warning_sent_at === null || ($isNewReading && $previousAbnormal !== 'Warning'))
                    && ($state->last_warning_sent_at === null
                        || (! $this->notifiedInCurrentPeriod($state->last_warning_sent_at)
                            && $state->last_warning_sent_at->lte(now()->subMinutes(config('sms_alerts.warning_cooldown_minutes')))));
            } elseif ($state->resolved_at && ! $state->last_recovery_sent_at) {
                $send = $state->last_critical_sent_at !== null || $state->last_warning_sent_at !== null;
            }

            if (! $send || ! $this->hasRecentCondition($lockedFarm, $status)) {
                $state->save();

                return null;
            }

            $state->pending_token = (string) Str::uuid();
            $state->pending_incident_token = $state->incident_token;
            $state->pending_status = $status;
            $state->pending_outcome = 'reserved';
            $state->pending_started_at = now();
            $state->retry_after = null;
            $state->save();

            return $state->pending_token;
        });

        if ($token !== null) {
            // The durable reservation commits BEFORE contacting the provider.
            // No transaction retry may replay this external side effect.
            if (DB::transactionLevel() > 0) {
                DB::afterCommit(fn () => $this->deliver($farm->id, $token));
            } else {
                $this->deliver($farm->id, $token);
            }
        }
    }

    public function deliver(int $farmId, string $token): void
    {
        $dispatch = DB::transaction(function () use ($farmId, $token) {
            $farm = Farm::whereKey($farmId)->lockForUpdate()->first();
            if (! $farm) {
                return null;
            }
            $state = FarmSmsAlertState::where('farm_id', $farmId)->first();
            if (! $state || $state->pending_token !== $token || $state->pending_outcome !== 'reserved') {
                return null;
            }
            if (! $this->hasRecentCondition($farm, $state->pending_status)) {
                $this->clearPending($state);
                $state->save();

                return null;
            }
            $state->pending_outcome = 'sending';
            $state->pending_started_at = now();
            $state->save();

            return [$farm, $state->pending_status];
        });
        if ($dispatch === null) {
            return;
        }

        [$farm, $status] = $dispatch;
        $outcome = $this->sms->sendWithOutcome(
            $farm->mobile_number, self::message($farm, $status), 'Farm Status',
            $farm->user_id, $farm->id, null, $token
        );

        DB::transaction(function () use ($farmId, $token, $outcome) {
            Farm::whereKey($farmId)->lockForUpdate()->first();
            $state = FarmSmsAlertState::where('farm_id', $farmId)->first();
            if ($state && $state->pending_token === $token) {
                $this->finish($state, $outcome, now());
                $state->save();
            }
        });
    }

    public static function message(Farm $farm, string $status): string
    {
        $action = match ($status) {
            'Critical' => 'Recommended: check farm ventilation and equipment soon.',
            'Warning' => 'Recommended: monitor ventilation and litter conditions.',
            'Safe' => 'Farm conditions are back to normal levels.',
            default => '',
        };

        return "AgriBantay Update: {$farm->farm_name} is now at {$status} level as of ".LocalTime::dateTime(now()).". {$action}";
    }

    private function openIncidents(int $farmId, array $deviceIds)
    {
        return AlertHistory::where('farm_id', $farmId)->whereNull('resolved_at')
            ->whereIn('sensor_type', config('sensors.alerting_metrics', ['ammonia']))
            ->where(fn ($query) => $query->whereNull('sensor_id')->orWhereIn('sensor_id', $deviceIds));
    }

    private function hasRecentCondition(Farm $farm, string $status): bool
    {
        // Reuse the existing classifier without changing the displayed farm
        // status. A healthy house's uploads must not keep reminding the owner
        // about another house whose last Critical sample has gone stale.
        $statusService = app(FarmStatusService::class);
        foreach ($farm->sensors()->where('status', 'Active')->get() as $sensor) {
            $reading = SensorReading::where('farm_id', $farm->id)->where('sensor_id', $sensor->id)
                ->orderByDesc('created_at')->orderByDesc('id')->first();
            if ($reading && $reading->created_at->gt(now()->subMinutes(config('sensors.offline_after_minutes', 3)))
                && $statusService->computeStatus($reading) === $status) {
                return true;
            }
        }

        return false;
    }

    /** Local visit times for today; invalid config cannot create extra sends. */
    private function reminderSlots(): array
    {
        $times = array_filter((array) config('sms_alerts.critical_reminder_times', []),
            fn ($time) => is_string($time) && preg_match('/\A(?:[01][0-9]|2[0-3]):[0-5][0-9]\z/', $time));
        $times = array_values(array_unique($times));
        sort($times);
        $day = now()->setTimezone(config('sms_alerts.timezone', 'Asia/Manila'))->startOfDay();

        return array_map(function ($time) use ($day) {
            [$hour, $minute] = array_map('intval', explode(':', $time));

            return $day->copy()->setTime($hour, $minute);
        }, $times);
    }

    private function notifiedInCurrentPeriod(?Carbon $sentAt): bool
    {
        if ($sentAt === null) {
            return false;
        }
        // Midnight starts the morning period, so a 06:59 initial alert also
        // covers the 07:00 reminder. Noon and afternoon start the next periods.
        $start = now()->setTimezone(config('sms_alerts.timezone', 'Asia/Manila'))->startOfDay();
        foreach (array_slice($this->reminderSlots(), 1) as $slot) {
            if ($slot->lte(now())) {
                $start = $slot;
            }
        }

        return $sentAt->gte($start);
    }

    private function repeatGapElapsed(Carbon $sentAt): bool
    {
        return $sentAt->lte(now()->subMinutes(max(1, (int) config('sms_alerts.minimum_repeat_minutes', 30))));
    }

    private function inReminderWindow(): bool
    {
        $minutes = max(1, (int) config('sms_alerts.reminder_window_minutes', 30));
        foreach ($this->reminderSlots() as $slot) {
            if (now()->gte($slot) && now()->lt($slot->copy()->addMinutes($minutes))) {
                return true;
            }
        }

        return false;
    }

    private function bootstrap(FarmSmsAlertState $state, Farm $farm, string $status, SensorReading $reading, array $deviceIds): void
    {
        $startedAt = $this->openIncidents($farm->id, $deviceIds)->min('triggered_at');
        if ($startedAt === null && ($status === 'Safe' || $farm->current_status === 'Safe')) {
            return;
        }
        $startedAt ??= $reading->created_at;
        $state->incident_token = (string) Str::uuid();
        $state->incident_started_at = $startedAt;
        $state->last_abnormal_status = $farm->current_status;
        // Adopt existing accepted SMSs at rollout instead of sending another
        // initial alert for an episode already notified by the old code.
        foreach (['Critical' => 'last_critical_sent_at', 'Warning' => 'last_warning_sent_at'] as $level => $field) {
            $state->{$field} = SmsLog::where('farm_id', $farm->id)->where('type', 'Farm Status')
                ->where('status', 'Sent')->where('created_at', '>=', $startedAt)
                ->where('message', 'like', '% is now at '.$level.' level as of %')
                ->latest('id')->value('created_at');
        }
        if ($farm->current_status === 'Safe' && $state->last_critical_sent_at) {
            $state->last_abnormal_status = 'Critical';
        }
    }

    private function recoverPending(FarmSmsAlertState $state): void
    {
        if ($state->pending_outcome !== 'sending') {
            return;
        }
        $log = SmsLog::where('sms_alert_token', $state->pending_token)->first();
        if ($log) {
            $outcome = $log->status === 'Sent' ? SmsService::ACCEPTED
                : (str_contains($log->failure_reason ?? '', 'acceptance is unknown') ? SmsService::UNKNOWN : SmsService::REJECTED);
            $this->finish($state, $outcome, $log->created_at);
        } elseif ($state->pending_started_at->lte(now()->subSeconds(config('sms_alerts.in_flight_timeout_seconds')))) {
            $state->pending_outcome = SmsService::UNKNOWN;
            Log::warning('Farm alert SMS requires provider reconciliation.', ['farm_id' => $state->farm_id, 'sms_alert_token' => $state->pending_token]);
        }
    }

    private function finish(FarmSmsAlertState $state, string $outcome, Carbon $timestamp): void
    {
        if ($outcome === SmsService::ACCEPTED) {
            if ($state->pending_incident_token === $state->incident_token) {
                $field = match ($state->pending_status) {
                    'Critical' => 'last_critical_sent_at',
                    'Warning' => 'last_warning_sent_at',
                    'Safe' => 'last_recovery_sent_at',
                };
                $state->{$field} = $timestamp;
            }
            $this->clearPending($state);
        } else {
            $state->pending_outcome = $outcome;
            $state->retry_after = $outcome === SmsService::REJECTED
                ? $timestamp->copy()->addMinutes(config('sms_alerts.retry_minutes')) : null;
        }
    }

    private function clearPending(FarmSmsAlertState $state): void
    {
        foreach (['pending_token', 'pending_incident_token', 'pending_status', 'pending_outcome', 'pending_started_at', 'retry_after'] as $field) {
            $state->{$field} = null;
        }
    }

    /** Only call after a human verifies the token in the UniSMS dashboard. */
    public function reconcile(int $farmId, string $token, string $outcome, Carbon $timestamp): bool
    {
        return DB::transaction(function () use ($farmId, $token, $outcome, $timestamp) {
            Farm::whereKey($farmId)->lockForUpdate()->first();
            $state = FarmSmsAlertState::where('farm_id', $farmId)->first();
            if (! $state || $state->pending_token !== $token
                || ! in_array($state->pending_outcome, ['sending', SmsService::UNKNOWN], true)
                || ! in_array($outcome, [SmsService::ACCEPTED, SmsService::REJECTED], true)) {
                return false;
            }
            // Do not let an operator release a request still in flight.
            if ($state->pending_outcome === 'sending'
                && $state->pending_started_at->gt(now()->subSeconds(config('sms_alerts.in_flight_timeout_seconds')))) {
                return false;
            }
            SmsLog::where('sms_alert_token', $token)->update([
                'status' => $outcome === SmsService::ACCEPTED ? 'Sent' : 'Failed',
                'failure_reason' => $outcome === SmsService::ACCEPTED
                    ? null : 'Provider rejection verified manually; retry after backoff.',
            ]);
            $this->finish($state, $outcome, $timestamp);
            $state->save();

            return true;
        });
    }
}
