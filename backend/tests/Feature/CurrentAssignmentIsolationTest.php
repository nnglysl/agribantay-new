<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AiRecommendation;
use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\FarmSmsAlertState;
use App\Models\Notification;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\CurrentMonitoringService;
use App\Services\DeviceAssignmentService;
use App\Services\FarmStatusService;
use App\Services\MonitoringDeploymentService;
use App\Services\ReadingSummaryService;
use App\Services\RecommendationExplanationService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\Support\PhaseOneDatabase;
use Tests\TestCase;

class CurrentAssignmentIsolationTest extends TestCase
{
    private User $admin;

    private Farm $a;

    private Farm $b;

    private Sensor $device;

    protected function setUp(): void
    {
        parent::setUp();
        config(['database.connections.phase1' => ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true],
            'sensors.alerting_metrics' => ['ammonia', 'moisture'], 'cache.default' => 'array']);
        DB::setDefaultConnection('phase1');
        DB::purge('phase1');
        PhaseOneDatabase::create();
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['message' => ['status' => 'pending', 'reference_id' => 'isolated-test']], 201)]);
        Mail::fake();
        $this->mock(RecommendationExplanationService::class, function ($mock) {
            $mock->shouldReceive('markForRefresh')->zeroOrMoreTimes();
            $mock->shouldReceive('explain')->zeroOrMoreTimes()->andReturn(['explanation_en' => 'Current fixture only']);
        });
        $this->travelTo(now()->setDate(2026, 10, 30)->setTime(1, 0, 0));
        $this->admin = $this->user('admin');
        $this->actingAs($this->admin, 'sanctum');
        $this->a = $this->farm('Farm A');
        $this->b = $this->farm('Farm B');
        $this->device = Sensor::create(['label' => 'AGB-D01', 'device_key' => 'isolated-fixture-device', 'status' => 'Active']);
        $this->assign($this->a);
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        DB::purge('phase1');
        parent::tearDown();
    }

    private function user(string $role): User
    {
        return User::create(['first_name' => $role, 'last_name' => 'Fixture',
            'mobile_number' => '09'.str_pad((string) (User::count() + 1), 9, '0', STR_PAD_LEFT),
            'role' => $role, 'status' => 'active']);
    }

    private function farm(string $name): Farm
    {
        $owner = $this->user('farm_owner');

        return Farm::create(['user_id' => $owner->id, 'farm_name' => $name, 'owner_name' => $owner->full_name,
            'mobile_number' => $owner->mobile_number, 'farm_size' => 'Small', 'barangay' => 'Aya']);
    }

    private function assign(?Farm $farm): void
    {
        $this->device = app(DeviceAssignmentService::class)->change($this->device->id, $farm?->id);
    }

    private function ingest(array $extra = []): SensorReading
    {
        $this->postJson('/api/sensor-readings', array_merge([
            'device_key' => $this->device->device_key, 'ammonia_raw' => 100,
            // Unambiguously Safe even when the intentionally absent device
            // polynomial makes ingestion use the unchanged raw fallback.
            'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60,
        ], $extra))->assertOk();

        return SensorReading::latest('id')->firstOrFail();
    }

    public function test_a_to_b_waits_for_its_first_reading_and_ignores_client_farm_id(): void
    {
        $old = $this->ingest();
        $attributes = $old->getAttributes();
        $this->assign(null);
        $this->assign($this->b);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($this->device));
        $this->assertSame('No Readings Yet', app(FarmStatusService::class)->displayStatus($this->b));
        $this->getJson('/api/admin/farms/'.$this->b->id)->assertOk()
            ->assertJsonPath('data.device_list.0.has_reading', false)
            ->assertJsonPath('data.device_list.0.ammonia', null);
        $new = $this->ingest(['farm_id' => $this->a->id]);
        $this->assertSame($this->b->id, $new->farm_id);
        $this->assertSame($new->id, app(CurrentMonitoringService::class)->latest($this->device)->id);
        $this->assertEquals($attributes, $old->fresh()->getAttributes());
        $this->assertSame(1, SensorReading::where('farm_id', $this->a->id)->count());
        $this->assertSame('Pending Setup', app(FarmStatusService::class)->displayStatus($this->a));
    }

    public function test_same_second_a_b_a_preserves_period_keys_and_daily_counts(): void
    {
        $first = $this->ingest();
        $key = app(MonitoringDeploymentService::class)->forFarm($this->a->id)[0]['assignment_key'];
        $this->assign($this->b);
        $middle = $this->ingest();
        $this->assign($this->a);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($this->device));
        $this->getJson('/api/admin/farms/'.$this->a->id)->assertOk()
            ->assertJsonCount(0, 'data.sensor_readings')->assertJsonPath('data.device_list.0.has_reading', false);
        $last = $this->ingest();
        $this->getJson('/api/admin/farms/'.$this->a->id)->assertOk()
            ->assertJsonPath('data.sensor_readings.0.id', $last->id);
        $periods = app(ReadingSummaryService::class)->forFarm($this->a->id);
        $this->assertCount(2, $periods);
        $this->assertSame($key, $periods[0]['assignment_key']);
        $this->assertNotSame($periods[0]['assignment_key'], $periods[1]['assignment_key']);
        $this->assertSame([1, 1], array_column($periods, 'total_readings'));
        $this->assertSame($last->id, app(CurrentMonitoringService::class)->latest($this->device)->id);
        $this->assertSame($this->a->id, $first->fresh()->farm_id);
        $this->assertSame($this->b->id, $middle->fresh()->farm_id);
        $this->assign($this->b);
        $this->actingAs(User::findOrFail($this->a->user_id), 'sanctum');
        $this->getJson('/api/farmer/dashboard?farm_id='.$this->a->id)->assertOk()
            ->assertJsonPath('data.previous_monitoring.reading_count', 1);
    }

    public function test_offline_keeps_only_current_visit_measurements(): void
    {
        $reading = $this->ingest();
        $this->travel(4)->minutes();
        $row = $this->getJson('/api/admin/farms/'.$this->a->id)->assertOk()->json('data.device_list.0');
        $this->assertSame('Offline', $row['connectivity']);
        $this->assertTrue($row['has_reading']);
        $this->assertEquals($reading->ammonia, $row['ammonia']);
        $this->assign($this->b);
        $row = $this->getJson('/api/admin/farms/'.$this->b->id)->assertOk()->json('data.device_list.0');
        $this->assertSame('Offline', $row['connectivity']);
        $this->assertFalse($row['has_reading']);
        $this->assertNull($row['ammonia']);
    }

    public function test_unassigned_or_inactive_device_cannot_ingest_or_supply_current_data(): void
    {
        $old = $this->ingest();
        $this->assign(null);
        $this->postJson('/api/sensor-readings', ['device_key' => $this->device->device_key,
            'ammonia_raw' => 100, 'soil_raw' => 3000, 'temperature' => 28, 'humidity' => 60])->assertStatus(409);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($this->device));
        $this->assertSame(1, SensorReading::count());
        $this->assign($this->b);
        $this->device->update(['status' => 'Inactive']);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($this->device));
        $this->assertSame($this->a->id, $old->fresh()->farm_id);
    }

    public function test_ledger_survives_duplicate_farm_names_and_renaming(): void
    {
        $this->a->update(['farm_name' => 'Same name']);
        $this->b->update(['farm_name' => 'Same name']);
        $this->ingest();
        $this->assign($this->b);
        $reading = $this->ingest();
        $this->assertSame($reading->id, app(CurrentMonitoringService::class)->latest($this->device)->id);
        $this->assertSame(1, app(MonitoringDeploymentService::class)->forFarm($this->a->id)[0]['reading_count']);
    }

    public function test_missing_or_ambiguous_legacy_evidence_fails_closed(): void
    {
        $device = Sensor::create(['farm_id' => $this->b->id, 'label' => 'Legacy', 'device_key' => 'legacy-fixture', 'status' => 'Active']);
        SensorReading::create(['farm_id' => $this->b->id, 'sensor_id' => $device->id, 'ammonia' => 40]);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($device));
        $this->farm('Farm B');
        ActivityLog::create(['action' => 'Assigned Sensor', 'details' => 'Assigned device Legacy to Farm B', 'type' => 'Farm']);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($device));
    }

    public function test_verified_legacy_boundary_accepts_later_rows_but_not_the_ambiguous_second(): void
    {
        $device = Sensor::create(['farm_id' => $this->b->id, 'label' => 'Legacy-known', 'device_key' => 'legacy-known-fixture', 'status' => 'Active']);
        ActivityLog::create(['action' => 'Assigned Sensor', 'details' => 'Assigned device Legacy-known to Farm B', 'type' => 'Farm']);
        SensorReading::create(['farm_id' => $this->b->id, 'sensor_id' => $device->id]);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($device));
        $this->travel(1)->seconds();
        $reading = SensorReading::create(['farm_id' => $this->b->id, 'sensor_id' => $device->id]);
        $this->assertSame($reading->id, app(CurrentMonitoringService::class)->latest($device)->id);
    }

    public function test_critical_incident_in_a_new_visit_is_separate_from_the_old_incident(): void
    {
        $this->ingest(['ammonia_raw' => 3000]);
        $old = AlertHistory::where('farm_id', $this->a->id)->firstOrFail();
        $attributes = $old->getAttributes();
        $this->assign($this->b);
        $this->assign($this->a);
        $this->ingest(['ammonia_raw' => 3000]);
        $this->assertSame(2, AlertHistory::where('farm_id', $this->a->id)->where('sensor_type', $old->sensor_type)->count());
        $this->assertEquals($attributes, $old->fresh()->getAttributes());
    }

    public function test_old_alerts_and_sms_episode_cannot_continue_or_recover_on_return(): void
    {
        $this->ingest(['ammonia_raw' => 3000]);
        $incident = AlertHistory::where('farm_id', $this->a->id)->firstOrFail();
        $original = $incident->getAttributes();
        $this->assign($this->b);
        $this->assign($this->a);
        $sent = count(Http::recorded());
        $notifications = Notification::count();
        app(FarmStatusService::class)->syncStatus($this->a->fresh());
        $this->assertCount($sent, Http::recorded());
        for ($i = 0; $i < 3; $i++) {
            $this->ingest();
        }
        $this->assertEquals($original, $incident->fresh()->getAttributes());
        $this->assertCount($sent, Http::recorded());
        $this->assertSame($notifications, Notification::count());
        $this->assertNull(FarmSmsAlertState::where('farm_id', $this->a->id)->value('resolved_at'));
    }

    public function test_farmer_staff_super_admin_and_insights_agree_after_reassignment(): void
    {
        $this->ingest(['ammonia_raw' => 3000]);
        $this->assign($this->b);
        foreach ([$this->admin, $this->user('super_admin')] as $user) {
            $this->actingAs($user, 'sanctum')->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.critical_alerts', 0);
        }
        $owner = User::findOrFail($this->b->user_id);
        $this->actingAs($owner, 'sanctum')->getJson('/api/farmer/dashboard?farm_id='.$this->b->id)->assertOk()
            ->assertJsonPath('data.devices.0.has_reading', false)->assertJsonPath('data.devices.0.ammonia', null);
        $this->getJson('/api/farmer/insights?farm_id='.$this->b->id)->assertOk()->assertJsonPath('data.available', false);
        $this->actingAs($this->admin, 'sanctum');
        $this->ingest(['ammonia_raw' => 3000]);
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.critical_farms.0.farm_id', $this->b->id);
    }

    public function test_multiple_devices_do_not_mix_farms(): void
    {
        $one = $this->ingest();
        $first = $this->device;
        $this->device = Sensor::create(['label' => 'AGB-D02', 'device_key' => 'second-fixture', 'status' => 'Active']);
        $this->assign($this->b);
        $two = $this->ingest(['ammonia_raw' => 3000]);
        $resolver = app(CurrentMonitoringService::class);
        $this->assertSame($one->id, $resolver->latest($first)->id);
        $this->assertSame($two->id, $resolver->latest($this->device)->id);
        $this->assertNull($resolver->latest($this->device, $this->a->id));
    }

    public function test_paginated_farm_status_filter_uses_the_current_visit(): void
    {
        $this->ingest(['ammonia_raw' => 3000]);
        $this->assign($this->b);
        $this->assign($this->a);
        $this->getJson('/api/admin/farms?monitoring_status=Critical&per_page=10')->assertOk()
            ->assertJsonPath('data.total', 0);
        $this->getJson('/api/admin/farms?monitoring_status=No%20Readings%20Yet&per_page=10')->assertOk()
            ->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.id', $this->a->id);
        $this->ingest(['ammonia_raw' => 3000]);
        $this->getJson('/api/admin/farms?monitoring_status=Critical&per_page=10')->assertOk()
            ->assertJsonPath('data.total', 1);
        $this->travel(4)->minutes();
        $this->getJson('/api/admin/farms?monitoring_status=Critical&per_page=10')->assertOk()
            ->assertJsonPath('data.total', 0);
        $this->getJson('/api/admin/farms?monitoring_status=Offline&per_page=10')->assertOk()
            ->assertJsonPath('data.total', 1);
    }

    public function test_assignment_and_audit_roll_back_together(): void
    {
        $logs = ActivityLog::count();
        DB::beginTransaction();
        $this->assign($this->b);
        DB::rollBack();
        $this->assertSame($this->a->id, $this->device->fresh()->farm_id);
        $this->assertSame($logs, ActivityLog::count());
        $this->assertSame(1, DB::table('device_assignment_events')->count());
    }

    public function test_insight_trend_does_not_reuse_samples_from_an_earlier_visit(): void
    {
        $this->ingest();
        $this->travel(1)->minutes();
        $this->ingest();
        $this->assign($this->b);
        $this->ingest();
        $this->assign($this->a);
        $this->ingest();
        $context = app(CurrentMonitoringService::class)->context($this->a);
        $this->actingAs(User::findOrFail($this->a->user_id), 'sanctum');
        $this->getJson('/api/farmer/insights?farm_id='.$this->a->id)->assertOk()->assertJsonPath('data.available', true);
        foreach ([$this->admin, $this->user('super_admin')] as $user) {
            $this->actingAs($user, 'sanctum')->getJson('/api/admin/farms/'.$this->a->id.'/root-cause')
                ->assertOk()->assertJsonPath('data.trend.sample_size', 1);
        }
        $this->app->make(RecommendationExplanationService::class)->shouldHaveReceived('explain')
            ->with(\Mockery::on(fn ($facts) => $facts['trend']['sample_size'] === 1 && $facts['monitoring_context'] === $context))
            ->times(3);
    }

    public function test_previous_visit_ai_cache_is_not_returned_during_retry_cooldown(): void
    {
        Schema::create('ai_recommendations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            foreach (['explanation_en', 'explanation_fil', 'main_action_fil', 'tips_fil'] as $field) {
                $t->text($field)->nullable();
            }
            $t->date('generated_date');
            $t->boolean('force_refresh')->default(false);
            $t->timestamps();
        });
        AiRecommendation::create(['farm_id' => $this->a->id, 'explanation_en' => 'Earlier visit text', 'generated_date' => now()->toDateString()]);
        Cache::put('gemini-monitoring-context-'.$this->a->id, 'previous-visit');
        Cache::put('gemini-attempt-'.$this->a->id, true, 600);
        config(['services.gemini.api_key' => 'isolated-fixture']);
        $service = new RecommendationExplanationService;
        $this->assertNull($service->explain(['farm_id' => $this->a->id,
            'monitoring_context' => app(CurrentMonitoringService::class)->context($this->a)]));
        Http::assertNothingSent();
    }

    public function test_same_second_history_uses_numeric_event_order_beyond_nine_events(): void
    {
        for ($i = 0; $i < 12; $i++) {
            $this->ingest();
            $this->assign($i % 2 === 0 ? $this->b : $this->a);
        }
        $keys = array_column(app(MonitoringDeploymentService::class)->forFarm($this->a->id), 'assignment_key');
        $ids = array_map(fn ($key) => (int) explode(':', $key)[1], $keys);
        $sorted = $ids;
        sort($sorted, SORT_NUMERIC);
        $this->assertSame($sorted, $ids);
        $this->assertSame(6, SensorReading::where('farm_id', $this->a->id)->count());
    }
}
