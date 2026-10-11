<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\FarmSmsAlertState;
use App\Models\Notification;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\SmsLog;
use App\Models\User;
use App\Services\AlertHistoryService;
use App\Services\FarmSmsAlertService;
use App\Services\FarmStatusService;
use App\Services\RecommendationExplanationService;
use Carbon\Carbon;
use Illuminate\Contracts\Foundation\MaintenanceMode;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\Support\SmsAlertDatabase;
use Tests\TestCase;

class SmsAlertTimingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'database.connections.sms_tests' => ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true],
            'services.unisms.secret_key' => 'fake-secret',
            'services.unisms.base_url' => 'https://sms.test/api',
            'sensors.alerting_metrics' => ['ammonia', 'moisture'],
            'sensors.offline_after_minutes' => 3,
            'sms_alerts.timezone' => 'Asia/Manila',
            'sms_alerts.critical_reminder_times' => ['07:00', '12:00', '17:00'],
            'sms_alerts.reminder_window_minutes' => 30,
            'sms_alerts.minimum_repeat_minutes' => 30,
        ]);
        DB::setDefaultConnection('sms_tests');
        DB::purge('sms_tests');
        SmsAlertDatabase::create();
        $this->travelTo(now()->setDate(2026, 10, 9)->setTime(0, 0));
        $this->fakeSms(['sms.test/*' => Http::response(['message' => ['status' => 'pending', 'reference_id' => 'fake-message']], 201)]);
        $this->mock(RecommendationExplanationService::class)->shouldReceive('markForRefresh')->zeroOrMoreTimes();
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        DB::purge('sms_tests');
        parent::tearDown();
    }

    private function farm(?User $owner = null): Farm
    {
        $owner ??= User::create(['first_name' => 'Test', 'last_name' => 'Farmer', 'mobile_number' => '09123456789', 'role' => 'farm_owner', 'status' => 'active']);
        $farm = Farm::create(['user_id' => $owner->id, 'farm_name' => 'Farm '.Str::random(6), 'owner_name' => 'Test Farmer', 'mobile_number' => $owner->mobile_number]);
        Sensor::create(['farm_id' => $farm->id, 'device_key' => (string) Str::uuid(), 'label' => 'Test device', 'status' => 'Active']);

        return $farm;
    }

    private function fakeSms($callback): void
    {
        // Laravel appends HTTP stubs; replacing the factory avoids a default
        // success stub masking an intended provider failure in these tests.
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake($callback);
    }

    private function record(Farm $farm, string $status, ?Sensor $sensor = null): SensorReading
    {
        $sensor ??= $farm->sensors()->firstOrFail();
        $reading = SensorReading::create([
            'farm_id' => $farm->id, 'sensor_id' => $sensor->id,
            'ammonia' => 40, 'ammonia_status' => $status,
            'moisture' => 10, 'moisture_status' => 'Safe',
            'temperature' => 29, 'temperature_status' => 'Safe',
            'humidity' => 60, 'humidity_status' => 'Safe', 'is_mock' => false,
        ]);
        $sensor->update(['last_seen_at' => now()]);
        foreach (['ammonia' => $status, 'moisture' => 'Safe'] as $metric => $level) {
            app(AlertHistoryService::class)->recordReading($farm->id, $metric, $level, 40, null, $sensor->id);
        }
        app(FarmStatusService::class)->syncStatus($farm->fresh());

        return $reading;
    }

    private function state(Farm $farm): FarmSmsAlertState
    {
        return FarmSmsAlertState::where('farm_id', $farm->id)->firstOrFail();
    }

    private function atLocal(string $time): void
    {
        $this->travelTo(Carbon::parse($time, 'Asia/Manila')->utc());
    }

    public function test_safe_to_critical_sends_immediately_with_the_existing_farm_message(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Safe');
        Http::assertNothingSent();
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => str_contains($request['content'], $farm->farm_name.' is now at Critical level') && isset($request['metadata']['sms_alert_token']));
        $this->assertSame(1, SmsLog::where('status', 'Sent')->count());
        $this->assertTrue($this->state($farm)->last_critical_sent_at->equalTo(now()));
    }

    public function test_warning_to_critical_bypasses_the_warning_cooldown(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Warning');
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
        $this->assertTrue($this->state($farm)->last_critical_sent_at->equalTo(now()));
    }

    public function test_continuous_readings_remind_only_at_visit_times(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $initial = now()->copy();
        for ($minute = 1; $minute < 30; $minute++) {
            $this->travel(1)->minutes();
            $this->record($farm, 'Critical');
            Http::assertSentCount(1);
        }
        $this->assertTrue($this->state($farm)->last_critical_sent_at->equalTo($initial));
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->atLocal('2026-10-09 11:59:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->atLocal('2026-10-09 12:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
        $this->atLocal('2026-10-09 12:29:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
        $this->atLocal('2026-10-09 17:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(3);
        // Reminders do not add in-app notifications.
        $this->assertSame(1, Notification::where('user_id', $farm->user_id)->count());
    }

    public function test_critical_to_warning_stops_reminders_and_preserves_the_existing_warning_transition(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->travel(1)->minutes();
        $this->record($farm, 'Warning');
        Http::assertSentCount(2);
        $this->travel(29)->minutes();
        $this->record($farm, 'Warning');
        $this->travel(30)->minutes();
        $this->record($farm, 'Warning');
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(2);
    }

    public function test_warning_critical_flips_do_not_repeat_a_critical_sms_in_the_same_period(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $episode = $this->state($farm)->incident_token;
        $this->travel(1)->minutes();
        $this->record($farm, 'Warning');
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        app(FarmStatusService::class)->syncStatus($farm->fresh());
        Http::assertSentCount(2);
        $this->assertSame($episode, $this->state($farm)->incident_token);
        $this->assertSame(1, AlertHistory::count());
    }

    public function test_a_safe_blip_keeps_the_incident_and_critical_clock_without_duplicate_sms(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $initial = $this->state($farm);
        $this->travel(1)->minutes();
        $this->record($farm, 'Safe');
        $this->assertNull($this->state($farm)->resolved_at);
        $this->assertNull(AlertHistory::first()->resolved_at);
        Http::assertSentCount(1);
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        $this->assertSame($initial->incident_token, $this->state($farm)->incident_token);
        $this->assertTrue($initial->last_critical_sent_at->equalTo($this->state($farm)->last_critical_sent_at));
        $this->assertSame(1, AlertHistory::count());
        Http::assertSentCount(1);
        $this->travel(28)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->atLocal('2026-10-09 12:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
    }

    public function test_three_distinct_safe_readings_confirm_recovery_and_send_one_recovery_sms(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        foreach ([1, 2, 3] as $count) {
            $this->travel(1)->minutes();
            $this->record($farm, 'Safe');
            $this->assertSame($count, $this->state($farm)->safe_readings_count);
            if ($count < 3) {
                $this->assertNull($this->state($farm)->resolved_at);
                Http::assertSentCount(1);
            }
        }
        $this->assertNotNull($this->state($farm)->resolved_at);
        $this->assertNotNull(AlertHistory::first()->resolved_at);
        Http::assertSentCount(2);
        app(FarmStatusService::class)->syncStatus($farm->fresh());
        Http::assertSentCount(2);
    }

    public function test_confirmed_recovery_then_new_critical_sends_a_new_initial_sms(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $episode = $this->state($farm)->incident_token;
        for ($i = 0; $i < 3; $i++) {
            $this->travel(1)->minutes();
            $this->record($farm, 'Safe');
        }
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(3);
        $this->assertNotSame($episode, $this->state($farm)->incident_token);
        $this->assertSame(2, AlertHistory::count());
    }

    public function test_duplicate_processing_does_not_count_as_multiple_safe_readings(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->travel(1)->minutes();
        $this->record($farm, 'Safe');
        for ($i = 0; $i < 5; $i++) {
            app(FarmStatusService::class)->syncStatus($farm->fresh());
        }
        $this->assertSame(1, $this->state($farm)->safe_readings_count);
        $this->assertNull($this->state($farm)->resolved_at);
        Http::assertSentCount(1);
    }

    public function test_two_farms_of_the_same_farmer_have_independent_clocks(): void
    {
        $a = $this->farm();
        $b = $this->farm($a->user);
        $this->atLocal('2026-10-09 11:20:00');
        $this->record($a, 'Critical');
        $this->atLocal('2026-10-09 11:59:00');
        $this->record($b, 'Critical');
        $this->atLocal('2026-10-09 12:00:00');
        $this->record($a, 'Critical');
        $this->record($b, 'Critical');
        Http::assertSentCount(3);
        $this->assertSame(2, SmsLog::where('farm_id', $a->id)->count());
        $this->assertSame(1, SmsLog::where('farm_id', $b->id)->count());
        $this->atLocal('2026-10-09 12:29:00');
        $this->record($b, 'Critical');
        Http::assertSentCount(4);
    }

    public function test_same_critical_reading_processed_twice_does_not_send_twice(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        app(FarmStatusService::class)->syncStatus($farm->fresh());
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(1);
    }

    public function test_overlapping_processing_during_provider_send_cannot_claim_the_same_sms(): void
    {
        $farm = $this->farm();
        $calls = 0;
        $this->fakeSms(function () use ($farm, &$calls) {
            $calls++;
            if ($calls === 1) {
                $state = $this->state($farm);
                app(FarmStatusService::class)->syncSmsAlerts($farm->fresh());
                // Even directly replaying the dispatch cannot send twice.
                app(FarmSmsAlertService::class)->deliver($farm->id, $state->pending_token);
            }

            return Http::response(['message' => ['status' => 'pending']], 201);
        });
        $this->record($farm, 'Critical');
        $this->assertSame(1, $calls);
        $this->assertSame(1, SmsLog::count());
    }

    public function test_provider_rejection_has_no_success_clock_and_retries_after_backoff(): void
    {
        $this->fakeSms(['sms.test/*' => Http::sequence()
            ->push(['errors' => 'Invalid recipient'], 422)
            ->push(['message' => ['status' => 'pending']], 201)
            ->push(['message' => ['status' => 'pending']], 201)]);
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->assertNull($this->state($farm)->last_critical_sent_at);
        $this->assertSame(0, SmsLog::where('status', 'Sent')->count());
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->travel(4)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
        $acceptedAt = now()->copy();
        $this->travel(29)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
        $this->assertTrue($this->state($farm)->last_critical_sent_at->equalTo($acceptedAt));
        $this->atLocal('2026-10-09 12:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(3);
    }

    public function test_failed_warning_does_not_delay_critical_escalation(): void
    {
        $this->fakeSms(['sms.test/*' => Http::sequence()->push([], 422)->push(['message' => ['status' => 'pending']], 201)]);
        $farm = $this->farm();
        $this->record($farm, 'Warning');
        $this->assertNull($this->state($farm)->last_warning_sent_at);
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
        $this->assertNotNull($this->state($farm)->last_critical_sent_at);
    }

    public function test_timeout_is_held_for_reconciliation_and_does_not_log_sensitive_exception_text(): void
    {
        Log::spy();
        $calls = 0;
        $this->fakeSms(function () use (&$calls) {
            $calls++;
            throw new ConnectionException('recipient=09123456789 Authorization=fake-secret');
        });
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        for ($i = 0; $i < 35; $i++) {
            $this->travel(1)->minutes();
            $this->record($farm, 'Critical');
        }
        $this->assertSame(1, $calls);
        $this->assertNull($this->state($farm)->last_critical_sent_at);
        $this->assertSame('unknown', $this->state($farm)->pending_outcome);
        $this->assertStringNotContainsString('09123456789', SmsLog::first()->failure_reason);
        $this->assertStringNotContainsString('fake-secret', SmsLog::first()->failure_reason);
        Log::shouldHaveReceived('error')->once()->with('SMS request did not confirm acceptance.', ['exception' => ConnectionException::class]);
    }

    public function test_tracking_survives_new_service_instances_like_a_server_restart(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->travel(29)->minutes();
        $this->app->forgetInstance(FarmSmsAlertService::class);
        $this->app->forgetInstance(FarmStatusService::class);
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->atLocal('2026-10-09 12:00:00');
        $this->app->forgetInstance(FarmSmsAlertService::class);
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
    }

    public function test_warning_safe_flips_are_deduplicated_and_warnings_do_not_repeat_each_minute(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Warning');
        for ($i = 0; $i < 10; $i++) {
            $this->travel(1)->minutes();
            $this->record($farm, $i % 2 === 0 ? 'Safe' : 'Warning');
        }
        Http::assertSentCount(1);
        $this->assertNull($this->state($farm)->resolved_at);
    }

    public function test_scheduler_does_not_send_reminders_using_stale_or_unassigned_devices(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 12:00:00');
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(1);
        $farm->sensors()->update(['farm_id' => null]);
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(1);
    }

    public function test_scheduler_sends_a_due_reminder_with_fresh_data_without_another_status_transition(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 11:59:00');
        $this->record($farm, 'Critical');
        $this->travel(1)->minutes();
        $this->artisan('sms-alerts:check')->assertSuccessful();
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(2);
    }

    public function test_existing_successful_critical_sms_is_adopted_at_rollout(): void
    {
        $farm = $this->farm();
        $sensor = $farm->sensors()->first();
        $reading = SensorReading::create(['farm_id' => $farm->id, 'sensor_id' => $sensor->id, 'ammonia_status' => 'Critical']);
        app(AlertHistoryService::class)->recordReading($farm->id, 'ammonia', 'Critical', 40, null, $sensor->id);
        $farm->update(['current_status' => 'Critical']);
        SmsLog::create(['farm_id' => $farm->id, 'phone_number' => $farm->mobile_number, 'message' => FarmSmsAlertService::message($farm, 'Critical'), 'type' => 'Farm Status', 'status' => 'Sent']);
        app(FarmStatusService::class)->syncStatus($farm->fresh());
        Http::assertNothingSent();
        $this->assertSame($reading->id, $this->state($farm)->last_reading_id);
        $this->assertNotNull($this->state($farm)->last_critical_sent_at);
    }

    public function test_success_logged_before_a_crash_restores_the_clock_without_resending(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $log = SmsLog::first();
        $state = $this->state($farm);
        $state->update(['last_critical_sent_at' => null, 'pending_token' => $log->sms_alert_token,
            'pending_incident_token' => $state->incident_token, 'pending_status' => 'Critical',
            'pending_outcome' => 'sending', 'pending_started_at' => now()]);
        app(FarmStatusService::class)->syncSmsAlerts($farm->fresh());
        Http::assertSentCount(1);
        $this->assertTrue($this->state($farm)->last_critical_sent_at->equalTo($log->created_at));
        $this->assertNull($this->state($farm)->pending_token);
    }

    public function test_an_unconfirmed_crashed_send_is_never_blindly_retried(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $state = $this->state($farm);
        $state->update(['pending_token' => (string) Str::uuid(), 'pending_incident_token' => $state->incident_token,
            'pending_status' => 'Critical', 'pending_outcome' => 'sending', 'pending_started_at' => now()]);
        $this->travel(3)->minutes();
        $this->record($farm, 'Critical');
        $this->assertSame('unknown', $this->state($farm)->pending_outcome);
        Http::assertSentCount(1);
    }

    public function test_in_app_notifications_still_follow_each_original_status_transition(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->travel(1)->minutes();
        $this->record($farm, 'Safe');
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        $this->assertSame(['Critical Farm Alert', 'Farm Condition Normalized', 'Critical Farm Alert'], Notification::orderBy('id')->pluck('title')->all());
        Http::assertSentCount(1);
        $this->assertSame('Critical', $farm->fresh()->current_status);
    }

    public function test_a_still_open_metric_incident_blocks_sms_recovery(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $sensor = $farm->sensors()->first();
        app(AlertHistoryService::class)->recordReading($farm->id, 'moisture', 'Critical', 40, null, $sensor->id);
        for ($i = 0; $i < 3; $i++) {
            $this->travel(1)->minutes();
            SensorReading::create(['farm_id' => $farm->id, 'sensor_id' => $sensor->id, 'ammonia_status' => 'Safe', 'moisture_status' => 'Safe']);
            app(AlertHistoryService::class)->recordReading($farm->id, 'ammonia', 'Safe', 10, null, $sensor->id);
            app(FarmStatusService::class)->syncSmsAlerts($farm->fresh());
        }
        $this->assertNull($this->state($farm)->resolved_at);
        Http::assertSentCount(1);
    }

    public function test_history_confirmed_recovery_is_reused_when_concurrent_ingests_were_already_saved(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $sensor = $farm->sensors()->first();
        for ($i = 0; $i < 3; $i++) {
            $this->travel(1)->minutes();
            SensorReading::create(['farm_id' => $farm->id, 'sensor_id' => $sensor->id, 'ammonia_status' => 'Safe', 'moisture_status' => 'Safe']);
            app(AlertHistoryService::class)->recordReading($farm->id, 'ammonia', 'Safe', 10, null, $sensor->id);
        }
        app(FarmStatusService::class)->syncSmsAlerts($farm->fresh());
        $this->assertNotNull($this->state($farm)->resolved_at);
        $this->assertSame(3, $this->state($farm)->safe_readings_count);
        Http::assertSentCount(2);
    }

    public function test_an_ambiguous_server_error_does_not_trigger_automatic_retries(): void
    {
        $this->fakeSms(['sms.test/*' => Http::response([], 500)]);
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->travel(5)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->assertNull($this->state($farm)->last_critical_sent_at);
        $this->assertSame('unknown', $this->state($farm)->pending_outcome);
    }

    public function test_provider_acceptance_time_is_recorded_after_the_response(): void
    {
        $this->fakeSms(function () {
            $this->travel(10)->seconds();

            return Http::response(['message' => ['status' => 'pending']], 201);
        });
        $farm = $this->farm();
        $reading = $this->record($farm, 'Critical');
        $this->assertTrue($this->state($farm)->last_critical_sent_at->equalTo($reading->created_at->copy()->addSeconds(10)));
    }

    public function test_an_accepted_sms_is_not_retried_if_writing_its_log_fails(): void
    {
        Log::spy();
        SmsLog::creating(function () {
            throw new \RuntimeException('Simulated logging failure');
        });
        try {
            $farm = $this->farm();
            $this->record($farm, 'Critical');
            $this->assertNotNull($this->state($farm)->last_critical_sent_at);
            $this->travel(1)->minutes();
            $this->record($farm, 'Critical');
            Http::assertSentCount(1);
        } finally {
            SmsLog::flushEventListeners();
        }
        Log::shouldHaveReceived('error')->once()->with('Could not persist the SMS delivery log.', ['exception' => \RuntimeException::class]);
    }

    public function test_a_send_is_deferred_until_the_enclosing_database_transaction_commits(): void
    {
        $farm = $this->farm();
        DB::beginTransaction();
        $this->record($farm, 'Critical');
        Http::assertNothingSent();
        $this->assertSame('reserved', $this->state($farm)->pending_outcome);
        DB::commit();
        Http::assertSentCount(1);
        $this->assertNotNull($this->state($farm)->last_critical_sent_at);
    }

    public function test_a_rolled_back_transaction_does_not_send_an_sms(): void
    {
        $farm = $this->farm();
        DB::beginTransaction();
        $this->record($farm, 'Critical');
        DB::rollBack();
        Http::assertNothingSent();
        $this->assertSame(0, FarmSmsAlertState::count());
    }

    public function test_each_houses_reading_uses_the_existing_worst_house_farm_status(): void
    {
        $farm = $this->farm();
        $critical = $farm->sensors()->first();
        $safe = Sensor::create(['farm_id' => $farm->id, 'device_key' => (string) Str::uuid(), 'status' => 'Active']);
        $this->record($farm, 'Critical', $critical);
        $this->travel(1)->minutes();
        $this->record($farm, 'Safe', $safe);
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical', $critical);
        Http::assertSentCount(1);
        $this->assertSame('Critical', $farm->fresh()->current_status);
    }

    public function test_a_rotated_devices_old_readings_do_not_send_sms_for_its_new_farm(): void
    {
        $old = $this->farm();
        $this->record($old, 'Critical');
        $new = $this->farm();
        $new->sensors()->update(['farm_id' => null]);
        $old->sensors()->update(['farm_id' => $new->id]);
        app(FarmStatusService::class)->syncSmsAlerts($new);
        Http::assertSentCount(1);
        $this->assertSame(0, SmsLog::where('farm_id', $new->id)->count());
    }

    public function test_unknown_acceptance_can_be_reconciled_without_sending_another_sms(): void
    {
        $this->fakeSms(['sms.test/*' => Http::response([], 500)]);
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $state = $this->state($farm);
        $acceptedAt = now()->toDateTimeString();
        $this->artisan('sms-alerts:reconcile', ['farm_id' => $farm->id, 'token' => $state->pending_token, 'outcome' => 'accepted', '--accepted-at' => $acceptedAt])->assertSuccessful();
        $this->assertNull($this->state($farm)->pending_token);
        $this->assertNotNull($this->state($farm)->last_critical_sent_at);
        Http::assertSentCount(1);
        $this->assertSame('Sent', SmsLog::first()->status);
        $this->artisan('sms-alerts:reconcile', ['farm_id' => $farm->id, 'token' => $state->pending_token, 'outcome' => 'rejected'])->assertFailed();
    }

    public function test_confirmed_rejection_after_reconciliation_retries_only_after_backoff(): void
    {
        $this->fakeSms(['sms.test/*' => Http::response([], 500)]);
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->artisan('sms-alerts:reconcile', ['farm_id' => $farm->id, 'token' => $this->state($farm)->pending_token, 'outcome' => 'rejected'])->assertSuccessful();
        $this->fakeSms(['sms.test/*' => Http::response(['message' => ['status' => 'pending']], 201)]);
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        Http::assertNothingSent();
        $this->travel(4)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
    }

    public function test_provider_reconciliation_cannot_release_a_request_still_in_flight(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $state = $this->state($farm);
        $token = (string) Str::uuid();
        $state->update(['pending_token' => $token, 'pending_incident_token' => $state->incident_token,
            'pending_status' => 'Critical', 'pending_outcome' => 'sending', 'pending_started_at' => now()]);
        $this->artisan('sms-alerts:reconcile', ['farm_id' => $farm->id, 'token' => $token, 'outcome' => 'rejected'])->assertFailed();
        $this->assertSame('sending', $this->state($farm)->pending_outcome);
    }

    public function test_a_healthy_houses_uploads_do_not_refresh_another_houses_stale_critical_condition(): void
    {
        $farm = $this->farm();
        $critical = $farm->sensors()->first();
        $healthy = Sensor::create(['farm_id' => $farm->id, 'device_key' => (string) Str::uuid(), 'status' => 'Active']);
        $this->record($farm, 'Critical', $critical);
        $this->atLocal('2026-10-09 12:00:00');
        $this->record($farm, 'Safe', $healthy);
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(1);
        // The displayed status calculation is deliberately untouched.
        $this->assertSame('Critical', $farm->fresh()->current_status);
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical', $critical);
        Http::assertSentCount(2);
    }

    public function test_initial_critical_before_seven_covers_the_morning_reminder(): void
    {
        $farm = $this->farm();
        $this->atLocal('2026-10-09 06:55:00');
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 07:00:00');
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 07:29:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->atLocal('2026-10-09 12:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
    }

    public function test_schedule_uses_manila_dates_across_utc_midnight(): void
    {
        $farm = $this->farm();
        $this->atLocal('2026-10-09 17:10:00');
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 23:59:00');
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-10 00:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->atLocal('2026-10-10 07:00:00');
        $this->assertSame('2026-10-09 23:00:00', now()->toDateTimeString());
        $this->record($farm, 'Critical');
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(2);
    }

    public function test_recent_alert_does_not_get_an_immediate_duplicate_at_noon(): void
    {
        $farm = $this->farm();
        $this->atLocal('2026-10-09 11:59:00');
        $this->record($farm, 'Critical');
        foreach (['12:00:00', '12:28:00'] as $time) {
            $this->atLocal('2026-10-09 '.$time);
            $this->record($farm, 'Critical');
            Http::assertSentCount(1);
        }
        $this->atLocal('2026-10-09 12:29:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
    }

    public function test_missed_reminder_windows_do_not_create_late_catch_up_messages(): void
    {
        $farm = $this->farm();
        $this->atLocal('2026-10-09 06:30:00');
        $this->record($farm, 'Critical');
        foreach (['12:30:00', '17:30:00', '20:00:00'] as $time) {
            $this->atLocal('2026-10-09 '.$time);
            $this->record($farm, 'Critical');
            $this->artisan('sms-alerts:check')->assertSuccessful();
            Http::assertSentCount(1);
        }
        $this->atLocal('2026-10-10 07:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
    }

    public function test_fresh_reading_within_the_window_gets_one_delayed_reminder(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 12:00:00');
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(1); // Offline, not a current Critical measurement.
        $this->atLocal('2026-10-09 12:10:00');
        $this->record($farm, 'Critical');
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(2);
    }

    public function test_safe_recovery_stops_all_later_reminders(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        for ($i = 0; $i < 3; $i++) {
            $this->travel(1)->minutes();
            $this->record($farm, 'Safe');
        }
        Http::assertSentCount(2);
        foreach (['12:00:00', '17:00:00'] as $time) {
            $this->atLocal('2026-10-09 '.$time);
            $this->record($farm, 'Safe');
            $this->artisan('sms-alerts:check')->assertSuccessful();
            Http::assertSentCount(2);
        }
    }

    public function test_sustained_warning_has_no_scheduled_reminders(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Warning');
        foreach (['12:00:00', '17:00:00'] as $time) {
            $this->atLocal('2026-10-09 '.$time);
            $this->record($farm, 'Warning');
            $this->artisan('sms-alerts:check')->assertSuccessful();
        }
        Http::assertSentCount(1);
    }

    public function test_warning_critical_flips_are_bounded_throughout_a_visit_period(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Warning');
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        foreach (['08:35:00', '09:00:00', '09:35:00', '10:00:00'] as $index => $time) {
            $this->atLocal('2026-10-09 '.$time);
            $this->record($farm, $index % 2 === 0 ? 'Warning' : 'Critical');
        }
        Http::assertSentCount(2);
        $this->atLocal('2026-10-09 12:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(3);
    }

    public function test_first_critical_escalation_at_night_is_still_immediate(): void
    {
        $farm = $this->farm();
        $this->atLocal('2026-10-09 22:00:00');
        $this->record($farm, 'Warning');
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
    }

    public function test_rejected_reminder_retries_within_its_window_without_consuming_the_period(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->fakeSms(['sms.test/*' => Http::sequence()->push([], 422)->push(['message' => ['status' => 'pending']], 201)]);
        $this->atLocal('2026-10-09 12:00:00');
        $this->record($farm, 'Critical');
        $this->assertSame('08:00', $this->state($farm)->last_critical_sent_at->copy()->setTimezone('Asia/Manila')->format('H:i'));
        $this->travel(4)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->travel(1)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
        $this->assertSame('12:05', $this->state($farm)->last_critical_sent_at->copy()->setTimezone('Asia/Manila')->format('H:i'));
    }

    public function test_rejected_reminder_does_not_retry_after_the_visit_window(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->fakeSms(['sms.test/*' => Http::sequence()->push([], 422)->push(['message' => ['status' => 'pending']], 201)]);
        $this->atLocal('2026-10-09 12:29:00');
        $this->record($farm, 'Critical');
        $this->travel(5)->minutes();
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->atLocal('2026-10-09 17:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
    }

    public function test_schedule_can_be_changed_without_changing_the_app_timezone(): void
    {
        config(['sms_alerts.critical_reminder_times' => ['08:00', '12:00', '16:00']]);
        $farm = $this->farm();
        $this->atLocal('2026-10-08 17:00:00');
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 07:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(1);
        $this->atLocal('2026-10-09 08:00:00');
        $this->record($farm, 'Critical');
        Http::assertSentCount(2);
        $this->assertSame('UTC', config('app.timezone'));
    }

    public function test_inactive_device_cannot_receive_a_scheduled_reminder(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 12:00:00');
        $sensor = $farm->sensors()->first();
        $sensor->update(['status' => 'Inactive']);
        $this->record($farm, 'Critical', $sensor);
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(1);
    }

    public function test_direct_checker_respects_the_maintenance_pause(): void
    {
        $farm = $this->farm();
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 11:59:00');
        $this->record($farm, 'Critical');
        $this->atLocal('2026-10-09 12:00:00');
        $this->mock(MaintenanceMode::class)
            ->shouldReceive('active')->andReturn(true);
        $this->artisan('sms-alerts:check')->assertSuccessful();
        Http::assertSentCount(1);
    }
}
