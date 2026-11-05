<?php

namespace Tests\Feature;

use App\Http\Controllers\Farmer\DashboardController;
use App\Http\Controllers\Farmer\InsightController;
use App\Http\Controllers\SensorIngestController;
use App\Models\Farm;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\HouseMonitoringService;
use App\Services\MoistureThresholdService;
use App\Services\MonitoringAssessmentService;
use App\Services\PoultryHouseFoundationReadiness;
use App\Services\RootCauseService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Functional decision audit only; literal in-memory schema, never a migration or initializer. */
class PoultryHouseConditionReviewTest extends TestCase
{
    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['database.connections.condition_review' => ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true],
            'cache.default' => 'array', 'logging.default' => 'null', 'services.gemini.api_key' => 'synthetic-only', 'sensors.offline_after_minutes' => 3]);
        DB::setDefaultConnection('condition_review');
        DB::purge('condition_review');
        $this->travelTo(now()->setDate(2026, 11, 2)->setTime(3, 50));
        Http::preventStrayRequests();
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode([
            'explanation_en' => 'Synthetic translation', 'explanation_fil' => 'Synthetic explanation', 'main_action_fil' => 'Synthetic action', 'tips_fil' => []])]]]]]], 200)]);
        Mail::fake();
        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('first_name');
            $t->string('last_name');
            $t->string('role');
            $t->string('status');
        });
        Schema::create('farms', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('user_id');
            $t->string('farm_name');
            $t->string('status')->default('Active');
            $t->string('barangay')->nullable();
            $t->unsignedInteger('last_house_number')->default(0);
            $t->timestamp('house_inventory_verified_at')->nullable();
            $t->timestamps();
        });
        Schema::create('sensors', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id')->nullable();
            $t->string('label');
            $t->string('sensor_code')->nullable();
            $t->string('status');
            $t->timestamp('last_seen_at')->nullable();
            $t->unsignedBigInteger('poultry_house_id')->nullable();
            $t->unsignedBigInteger('current_assignment_event_id')->nullable();
            $t->timestamps();
        });
        Schema::create('sensor_readings', function (Blueprint $t) {
            $t->id();
            foreach (['farm_id', 'sensor_id', 'poultry_house_id', 'assignment_event_id'] as $c) {
                $t->unsignedBigInteger($c)->nullable();
            } foreach (['ammonia', 'moisture', 'temperature', 'humidity'] as $m) {
                $t->decimal($m)->nullable();
                $t->string($m.'_status');
            } $t->timestamps();
        });
        Schema::create('poultry_houses', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            $t->unsignedInteger('house_number');
            $t->string('status');
        });
        Schema::create('poultry_house_initializations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            $t->string('verification_reference');
            $t->string('verifier_role');
        });
        Schema::create('device_assignment_events', function (Blueprint $t) {
            $t->id();
            foreach (['sensor_id', 'activity_log_id', 'to_farm_id', 'to_house_id', 'from_farm_id'] as $c) {
                $t->unsignedBigInteger($c)->nullable();
            } $t->unsignedInteger('to_house_number')->nullable();
            $t->unsignedBigInteger('reading_floor_id')->default(0);
            $t->unsignedBigInteger('alert_floor_id')->default(0);
            $t->timestamp('occurred_at');
        });
        Schema::create('activity_logs', function (Blueprint $t) {
            $t->id();
            $t->string('action');
            $t->string('details');
            $t->timestamps();
        });
        Schema::create('maintenance_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            $t->string('maintenance_type');
            $t->date('performed_at');
        });
        Schema::create('service_requests', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            $t->string('service_type');
            $t->string('status');
            $t->timestamp('scheduled_at')->nullable();
        });
        // SQLite cannot certify the native foundation. Isolate ONLY readiness; execute real decision/query code.
        $readiness = Mockery::mock(new PoultryHouseFoundationReadiness);
        $readiness->shouldReceive('inspect')->andReturn(['ready' => true]);
        $this->app->instance(PoultryHouseFoundationReadiness::class, $readiness);
        DB::table('users')->insert([['id' => 1, 'first_name' => 'Fixture', 'last_name' => 'Owner', 'role' => 'farm_owner', 'status' => 'active'], ['id' => 2, 'first_name' => 'Other', 'last_name' => 'Owner', 'role' => 'farm_owner', 'status' => 'active']]);
        foreach ([1 => 1, 2 => 1, 3 => 2] as $id => $owner) {
            DB::table('farms')->insert(['id' => $id, 'user_id' => $owner, 'farm_name' => 'Synthetic Farm '.$id, 'status' => 'Active', 'created_at' => now()->subMonth(), 'updated_at' => now(), 'house_inventory_verified_at' => now()]);
            DB::table('poultry_house_initializations')->insert(['farm_id' => $id, 'verification_reference' => 'SYNTHETIC-SURVEY', 'verifier_role' => 'admin']);
        }
        $this->owner = User::findOrFail(1);
        $this->actingAs($this->owner);
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        DB::purge('condition_review');
        parent::tearDown();
    }

    private function house(string $state, int $farm = 1, ?array $statuses = null): int
    {
        $number = DB::table('poultry_houses')->where('farm_id', $farm)->count() + 1;
        $house = DB::table('poultry_houses')->insertGetId(['farm_id' => $farm, 'house_number' => $number, 'status' => $state === 'Inactive' ? 'Inactive' : 'Active']);
        if (in_array($state, ['Not Monitored', 'Inactive'], true)) {
            return $house;
        }
        $this->device($state, $farm, $house, $statuses);

        return $house;
    }

    private function device(string $state, int $farm, ?int $house, ?array $statuses = null): void
    {
        $stale = $state === 'Offline';
        $id = DB::table('sensors')->insertGetId(['farm_id' => $farm, 'poultry_house_id' => $house, 'label' => 'Synthetic '.(DB::table('sensors')->count() + 1), 'status' => 'Active', 'last_seen_at' => $state === 'No Readings Yet' ? null : ($stale ? now()->subMinutes(3) : now())]);
        $event = DB::table('device_assignment_events')->insertGetId(['sensor_id' => $id, 'activity_log_id' => $id, 'to_farm_id' => $farm, 'to_house_id' => $house, 'to_house_number' => $house ? DB::table('poultry_houses')->where('id', $house)->value('house_number') : null, 'occurred_at' => now()->subHour()]);
        DB::table('sensors')->where('id', $id)->update(['current_assignment_event_id' => $house ? $event : null]);
        if ($state === 'No Readings Yet') {
            return;
        }
        [$a, $m] = $statuses ?? [$state === 'Critical' ? 'Critical' : ($state === 'Warning' ? 'Warning' : 'Safe'), 'Safe'];
        $values = ['Safe' => 4, 'Warning' => 30, 'Critical' => 40];
        DB::table('sensor_readings')->insert(['farm_id' => $farm, 'sensor_id' => $id, 'poultry_house_id' => $house, 'assignment_event_id' => $house ? $event : null,
            'ammonia' => in_array($state, ['Invalid', 'Partial Safe', 'Partial Critical'], true) ? null : $values[$a], 'ammonia_status' => $a,
            'moisture' => $state === 'Invalid' ? null : ($m === 'Safe' ? 10 : $values[$m]), 'moisture_status' => $state === 'Partial Critical' ? 'Critical' : $m,
            'temperature' => 45, 'temperature_status' => 'Critical', 'humidity' => 90, 'humidity_status' => 'Critical', 'created_at' => $stale ? now()->subMinutes(3) : now(), 'updated_at' => now()]);
    }

    public static function primaryMatrix(): array
    {
        $cases = [];
        foreach (['Safe', 'Warning', 'Critical'] as $a) {
            foreach (['Safe', 'Warning', 'Critical'] as $m) {
                $cases[$a.'/'.$m] = [$a, $m, in_array('Critical', [$a, $m], true) ? 'Critical' : (in_array('Warning', [$a, $m], true) ? 'Warning' : 'Safe')];
            }
        }

        return $cases;
    }

    #[DataProvider('primaryMatrix')]
    public function test_nine_primary_combinations_in_actual_house_and_farm_queries(string $a, string $m, string $expected): void
    {
        $this->house('Safe', 1, [$a, $m]);
        $snapshot = app(HouseMonitoringService::class)->snapshot($this->owner, 1);
        $this->assertSame($expected, $snapshot['rows'][0]['state']);
        $this->assertSame($expected, $snapshot['farm_assessment']['condition']);
        $this->assertSame('Critical', $snapshot['rows'][0]['current_reading']['temperature_status']);
        $this->assertFalse($snapshot['farm_assessment']['incomplete_data']);
    }

    public static function farmMatrix(): array
    {
        return [
            'all safe' => [['Safe', 'Safe'], 'Safe', false], 'one warning' => [['Safe', 'Warning'], 'Warning', false],
            'critical warning' => [['Warning', 'Critical'], 'Critical', false], 'critical offline' => [['Critical', 'Offline'], 'Critical', true],
            'safe offline' => [['Safe', 'Offline'], 'Incomplete Data', true], 'all offline' => [['Offline', 'Offline'], 'Offline', true],
            'all unmonitored' => [['Not Monitored', 'Not Monitored'], 'Pending Setup', false], 'awaiting' => [['No Readings Yet'], 'No Readings Yet', true],
            'invalid' => [['Invalid'], 'No Readings Yet', true], 'partial safe' => [['Partial Safe'], 'Incomplete Data', true],
            'partial critical' => [['Partial Critical'], 'Critical', true], 'no houses' => [[], 'Pending Setup', false],
            'only inactive' => [['Inactive'], 'Pending Setup', false], 'safe plus unmonitored MISMATCH' => [['Safe', 'Not Monitored'], 'Safe', false],
            'critical plus unmonitored coverage MISMATCH' => [['Critical', 'Not Monitored'], 'Critical', false],
            'warning plus unmonitored coverage MISMATCH' => [['Warning', 'Not Monitored'], 'Warning', false],
        ];
    }

    #[DataProvider('farmMatrix')]
    public function test_actual_device_based_rollup_and_distinct_house_states(array $states, string $expected, bool $incomplete): void
    {
        foreach ($states as $state) {
            $this->house($state);
        }
        $snapshot = app(HouseMonitoringService::class)->snapshot($this->owner, 1);
        $this->assertSame($expected, $snapshot['farm_assessment']['condition']);
        $this->assertSame($incomplete, $snapshot['farm_assessment']['incomplete_data']);
        $this->assertCount(count($states), $snapshot['rows']);
        foreach ($snapshot['rows'] as $row) {
            if ($row['connectivity'] !== 'Online') {
                $this->assertNull($row['current_reading']);
            }
        }
        if (in_array('Offline', $states, true)) {
            $this->assertContains('Offline', array_column($snapshot['rows'], 'state'));
        }
        if (in_array('Not Monitored', $states, true)) {
            $this->assertGreaterThan(0, $snapshot['coverage']['unmonitored_houses']);
        }
    }

    public function test_selected_farm_ownership_history_and_legacy_remain_distinct(): void
    {
        $this->house('Safe', 1);
        $this->house('Critical', 2);
        $this->house('Warning', 3);
        $this->assertSame('Safe', app(HouseMonitoringService::class)->snapshot($this->owner, 1)['farm_assessment']['condition']);
        $this->assertSame('Critical', app(HouseMonitoringService::class)->snapshot($this->owner, 2)['farm_assessment']['condition']);
        try {
            app(HouseMonitoringService::class)->snapshot($this->owner, 3);
            $this->fail('Foreign farm must refuse');
        } catch (ModelNotFoundException) {
            $this->addToAssertionCount(1);
        }
        $this->device('Critical', 1, null);
        $snapshot = app(HouseMonitoringService::class)->snapshot($this->owner, 1);
        $this->assertSame('Critical', $snapshot['farm_assessment']['condition'], 'Legacy devices still participate in current farm severity');
        $this->assertSame('House not recorded', $snapshot['rows'][1]['house_name']);
        $this->assertNull($snapshot['rows'][1]['poultry_house_id']);
        $history = app(HouseMonitoringService::class)->history($this->owner, 1, ['poultry_house_id' => 'unknown']);
        $this->assertSame(1, $history['total']);
        $this->assertNull($history['items'][0]['poultry_house_id']);
    }

    public function test_dashboard_actual_snapshot_counts_include_inactive_but_no_severity_from_it(): void
    {
        $this->house('Critical');
        $this->house('Warning');
        $this->house('Not Monitored');
        $this->house('Inactive');
        $request = Request::create('/api/farmer/dashboard', 'GET', ['farm_id' => 1]);
        $request->setUserResolver(fn () => $this->owner);
        $data = app(DashboardController::class)->index($request)->getData(true)['data'];
        $this->assertSame(1, $data['farm_id']);
        $this->assertCount(4, $data['house_monitoring']['rows']);
        $this->assertSame(3, $data['house_monitoring']['coverage']['active_houses']);
        $this->assertSame(1, $data['house_monitoring']['coverage']['inactive_houses']);
        $this->assertSame('Critical', $data['health_status']);
        $this->assertSame(12, $data['cleanout_compliance']['interval_months']);
    }

    public function test_existing_threshold_boundaries_without_ingestion_or_configuration_changes(): void
    {
        $method = new \ReflectionMethod(SensorIngestController::class, 'status');
        foreach (['ammonia_ppm', 'ammonia_placeholder'] as $scale) {
            $cuts = config('sensors.'.$scale);
            foreach ([[$cuts['warning'] - 0.001, 'Safe'], [$cuts['warning'], 'Warning'], [$cuts['critical'] - 0.001, 'Warning'], [$cuts['critical'], 'Critical']] as [$value, $expected]) {
                $this->assertSame($expected, $method->invoke(app(SensorIngestController::class), $value, $cuts['warning'], $cuts['critical']));
            }
        }
        foreach ([[24.999, 'Safe'], [25, 'Warning'], [34.999, 'Warning'], [35, 'Critical']] as [$value, $expected]) {
            $this->assertSame($expected, app(MoistureThresholdService::class)->classify($value));
        }
        $r = new SensorReading(['ammonia' => null, 'ammonia_status' => 'Critical', 'moisture' => 0, 'moisture_status' => 'Safe']);
        $a = app(MonitoringAssessmentService::class)->reading($r);
        $this->assertSame('Incomplete Data', $a['condition']);
        $this->assertSame(['moisture'], $a['available_primary_metrics']);
        foreach ([null, 'invalid', INF, NAN] as $invalid) {
            $r = new SensorReading(['ammonia' => $invalid, 'ammonia_status' => 'Critical', 'moisture' => null, 'moisture_status' => 'Safe']);
            $this->assertSame('No Readings Yet', app(MonitoringAssessmentService::class)->reading($r)['condition']);
        }
        $r = new SensorReading(['ammonia' => 0, 'ammonia_status' => 'Safe', 'moisture' => 0, 'moisture_status' => 'Safe']);
        $this->assertSame('Safe', app(MonitoringAssessmentService::class)->reading($r)['condition']);
        $r->ammonia_status = 'Unknown';
        $r->moisture = null;
        $this->assertSame('No Readings Yet', app(MonitoringAssessmentService::class)->reading($r)['condition']);
    }

    public function test_real_insight_is_farm_level_and_offline_does_not_generate_current_advice(): void
    {
        $this->house('Critical');
        $this->house('Warning');
        $request = Request::create('/api/farmer/insights', 'GET', ['farm_id' => 1]);
        $data = app(InsightController::class)->index($request)->getData(true)['data'];
        $this->assertTrue($data['available']);
        $this->assertNotEmpty($data['tips']);
        $this->assertStringContainsString('Ammonia 40 (Critical)', $data['main_action']);
        $this->assertArrayNotHasKey('poultry_house_id', $data);
        $this->assertArrayNotHasKey('sensor_id', $data);
        app(InsightController::class)->index($request);
        Http::assertSentCount(1);
        $this->travel(3)->minutes();
        $off = app(InsightController::class)->index($request)->getData(true)['data'];
        $this->assertFalse($off['available']);
        Http::assertSentCount(1);
    }

    public function test_inactive_house_history_is_retained_and_future_or_wrong_period_samples_are_not_current(): void
    {
        $house = $this->house('Inactive');
        $retainedEvent = DB::table('device_assignment_events')->insertGetId(['sensor_id' => 999, 'activity_log_id' => 999, 'to_farm_id' => 1, 'to_house_id' => $house, 'to_house_number' => 1, 'occurred_at' => now()->subDays(2)]);
        DB::table('sensor_readings')->insert(['farm_id' => 1, 'sensor_id' => null, 'poultry_house_id' => $house, 'assignment_event_id' => $retainedEvent,
            'ammonia' => 40, 'ammonia_status' => 'Critical', 'moisture' => 40, 'moisture_status' => 'Critical', 'temperature' => 28, 'temperature_status' => 'Safe', 'humidity' => 60, 'humidity_status' => 'Safe', 'created_at' => now()->subDay(), 'updated_at' => now()->subDay()]);
        $this->assertSame('Pending Setup', app(MonitoringAssessmentService::class)->farm(Farm::findOrFail(1))['condition']);
        $this->assertSame(1, app(HouseMonitoringService::class)->history($this->owner, 1, ['poultry_house_id' => $house])['total']);
        $this->house('Safe', 2);
        DB::table('sensor_readings')->where('farm_id', 2)->update(['created_at' => now()->addMinute()]);
        $this->assertSame('No Readings Yet', app(HouseMonitoringService::class)->snapshot($this->owner, 2)['rows'][0]['state']);
        DB::table('sensor_readings')->where('farm_id', 2)->update(['created_at' => now(), 'assignment_event_id' => 999]);
        $snapshot = app(HouseMonitoringService::class)->snapshot($this->owner, 2);
        $this->assertSame('No Readings Yet', $snapshot['rows'][0]['state']);
        $this->assertSame('Safe', $snapshot['farm_assessment']['condition'], 'CurrentMonitoring uses device/farm watermarks, not the house/event tuple: documented mismatch');
    }

    public function test_insight_ranking_can_select_a_null_primary_with_carried_status_before_valid_warning(): void
    {
        $this->house('Partial Safe', 1, ['Critical', 'Safe']);
        $this->house('Warning');
        $diagnosis = Mockery::mock(RootCauseService::class)->makePartial();
        $diagnosis->shouldReceive('diagnose')->once()->withArgs(fn ($current) => $current['ammonia'] === null)->passthru();
        $this->app->instance(RootCauseService::class, $diagnosis);
        $request = Request::create('/api/farmer/insights', 'GET', ['farm_id' => 1]);
        $data = app(InsightController::class)->index($request)->getData(true)['data'];
        $this->assertTrue($data['available']);
        $this->assertSame('Warning', app(MonitoringAssessmentService::class)->farm(Farm::findOrFail(1))['condition']);
        $this->assertArrayNotHasKey('poultry_house_id', $data);
    }

    public function test_legacy_farm_without_registered_houses_can_still_be_safe_under_existing_rules(): void
    {
        $this->device('Safe', 1, null);
        $snapshot = app(HouseMonitoringService::class)->snapshot($this->owner, 1);
        $this->assertSame('Safe', $snapshot['farm_assessment']['condition']);
        $this->assertSame(0, $snapshot['coverage']['active_houses']);
        $this->assertSame(1, $snapshot['coverage']['legacy_devices']);
        $this->assertNull($snapshot['rows'][0]['poultry_house_id']);
    }
}
