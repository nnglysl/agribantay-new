<?php

namespace Tests\Feature;

use App\Models\SensorReading;
use App\Models\User;
use App\Services\MonitoringAssessmentService;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Synthetic SQLite memory only. No migrations, source database or providers. */
class FarmerReadingHistoryPaginationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'farmer_readings_memory',
            'database.connections.farmer_readings_memory' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true],
            'cache.default' => 'array', 'session.driver' => 'array', 'logging.default' => 'null',
            'services.unisms.secret_key' => '', 'services.gemini.api_key' => '']);
        DB::setDefaultConnection('farmer_readings_memory');
        $this->assertSame('sqlite', DB::connection()->getPdo()->getAttribute(\PDO::ATTR_DRIVER_NAME));
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        Http::preventStrayRequests();
        Mail::fake();
        $this->travelTo(Carbon::parse('2026-11-03T04:00:00Z'));
        Schema::create('users', function (Blueprint $t) {
            $t->id(); $t->string('role'); $t->string('status'); $t->string('first_name')->nullable(); $t->string('last_name')->nullable();
        });
        Schema::create('farms', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('user_id'); $t->string('farm_name'); $t->string('status');
        });
        Schema::create('sensors', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('farm_id')->nullable(); $t->string('label')->nullable(); $t->string('sensor_code')->nullable(); $t->string('status');
        });
        Schema::create('poultry_houses', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('farm_id'); $t->unsignedInteger('house_number');
        });
        Schema::create('device_assignment_events', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('to_farm_id'); $t->unsignedBigInteger('to_house_id')->nullable(); $t->unsignedInteger('to_house_number')->nullable(); $t->timestamp('occurred_at');
        });
        Schema::create('sensor_readings', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('farm_id'); $t->unsignedBigInteger('sensor_id')->nullable();
            $t->unsignedBigInteger('poultry_house_id')->nullable(); $t->unsignedBigInteger('assignment_event_id')->nullable();
            foreach (['ammonia', 'moisture', 'temperature', 'humidity'] as $metric) {
                $t->double($metric)->nullable(); $t->string($metric.'_status')->nullable();
            }
            $t->timestamps();
        });
        DB::table('users')->insert([['id' => 1, 'role' => 'farm_owner', 'status' => 'active'], ['id' => 2, 'role' => 'farm_owner', 'status' => 'active'], ['id' => 3, 'role' => 'super_admin', 'status' => 'active']]);
        DB::table('farms')->insert([['id' => 1, 'user_id' => 1, 'farm_name' => 'Synthetic A', 'status' => 'Active'], ['id' => 2, 'user_id' => 1, 'farm_name' => 'Synthetic B', 'status' => 'Active'], ['id' => 3, 'user_id' => 2, 'farm_name' => 'Synthetic C', 'status' => 'Active']]);
        DB::table('sensors')->insert([['id' => 21, 'farm_id' => 1, 'label' => 'Fixture device A', 'status' => 'Active'], ['id' => 22, 'farm_id' => 2, 'label' => 'Moved fixture device', 'status' => 'Active'], ['id' => 23, 'farm_id' => 3, 'label' => 'Foreign fixture device', 'status' => 'Active']]);
        DB::table('poultry_houses')->insert([['id' => 11, 'farm_id' => 1, 'house_number' => 1], ['id' => 12, 'farm_id' => 1, 'house_number' => 2], ['id' => 31, 'farm_id' => 3, 'house_number' => 1]]);
        for ($id = 1; $id <= 61; $id++) {
            $status = ['Safe', 'Warning', 'Critical', 'Safe', 'Critical', 'Unknown'][$id % 6];
            DB::table('sensor_readings')->insert($this->sample($id, [
                'sensor_id' => $id % 3 === 0 ? 22 : 21, 'poultry_house_id' => $id % 4 === 0 ? null : 11,
                'ammonia_status' => $status, 'ammonia' => $id % 6 === 4 ? null : 1000,
                'moisture' => in_array($id % 6, [3, 4, 5], true) ? null : 10,
            ]));
        }
        DB::table('sensor_readings')->insert($this->sample(1000, ['farm_id' => 3, 'sensor_id' => 23, 'poultry_house_id' => 31]));
        DB::table('sensor_readings')->insert($this->sample(2000, ['farm_id' => 2, 'sensor_id' => 22, 'poultry_house_id' => null]));
        $this->actingAs(User::findOrFail(1), 'sanctum');
    }

    private function sample(int $id, array $changes = []): array
    {
        return array_replace(['id' => $id, 'farm_id' => 1, 'sensor_id' => 21, 'poultry_house_id' => 11, 'assignment_event_id' => null,
            'ammonia' => 3, 'ammonia_status' => 'Safe', 'moisture' => 10, 'moisture_status' => 'Safe',
            'temperature' => 99, 'temperature_status' => 'Critical', 'humidity' => 99, 'humidity_status' => 'Critical',
            'created_at' => '2026-11-02 03:00:00', 'updated_at' => '2026-11-02 03:00:00'], $changes);
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        DB::purge('farmer_readings_memory');
        parent::tearDown();
    }

    public function test_bounded_pagination_has_stable_order_and_clamps_out_of_range_pages(): void
    {
        $url = '/api/farms/1/house-readings';
        $first = $this->getJson($url.'?query_key=fixture-view')->assertOk()->assertJsonCount(10, 'data.items')->assertJsonPath('data.total', 61)->assertJsonPath('data.last_page', 7)->assertJsonPath('data.query_key', 'fixture-view');
        $this->assertSame(range(61, 52), array_column($first->json('data.items'), 'id'));
        $this->getJson($url.'?page=2')->assertOk()->assertJsonPath('data.items.0.id', 51);
        $this->getJson($url.'?page=999')->assertOk()->assertJsonPath('data.current_page', 7)->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.id', 1);
        foreach ([25, 50] as $size) $this->getJson($url.'?per_page='.$size)->assertOk()->assertJsonCount($size, 'data.items');
        $this->getJson($url.'?poultry_house_id=12&page=999')->assertOk()->assertJsonPath('data.total', 0)->assertJsonPath('data.current_page', 1)->assertJsonCount(0, 'data.items');
    }

    public function test_condition_filters_match_existing_recorded_primary_assessments_before_pagination(): void
    {
        $all = SensorReading::where('farm_id', 1)->orderByDesc('created_at')->orderByDesc('id')->get();
        foreach (['Safe', 'Warning', 'Critical', 'Incomplete Data', 'No Readings Yet'] as $condition) {
            $expected = $all->filter(fn ($reading) => app(MonitoringAssessmentService::class)->reading($reading)['condition'] === $condition)->pluck('id')->all();
            $response = $this->getJson('/api/farms/1/house-readings?per_page=10&condition='.rawurlencode($condition))->assertOk()->assertJsonPath('data.total', count($expected));
            $this->assertSame(array_slice($expected, 0, 10), array_column($response->json('data.items'), 'id'));
        }
        // A high raw value with a recorded Safe status stays Safe; supporting
        // temperature/humidity statuses never override the primary assessment.
        $this->getJson('/api/farms/1/house-readings?condition=Safe')->assertOk()->assertJsonPath('data.items.0.ammonia_status', 'Safe');
    }

    public function test_house_and_device_filters_include_legacy_and_previously_assigned_devices(): void
    {
        $response = $this->getJson('/api/farms/1/house-readings?sensor_id=22&poultry_house_id=unknown&condition=Safe')->assertOk();
        $expected = SensorReading::where('farm_id', 1)->where('sensor_id', 22)->whereNull('poultry_house_id')->get()
            ->filter(fn ($reading) => app(MonitoringAssessmentService::class)->reading($reading)['condition'] === 'Safe')->count();
        $response->assertJsonPath('data.total', $expected);
        foreach ($response->json('data.items') as $item) {
            $this->assertNull($item['poultry_house_id']); $this->assertSame(22, $item['sensor_id']); $this->assertSame('House not recorded', $item['house_name']);
        }
        $this->assertSame([21, 22], array_column($response->json('data.devices'), 'id'));
        $this->getJson('/api/farms/1/house-readings?sensor_id=23')->assertNotFound();
        $this->getJson('/api/farms/1/house-readings?poultry_house_id=31')->assertNotFound();
        $this->getJson('/api/farms/2/house-readings')->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.id', 2000);
    }

    public function test_date_range_uses_inclusive_manila_days_and_original_timestamps(): void
    {
        foreach ([4001 => '2026-11-01 15:59:59', 4002 => '2026-11-01 16:00:00', 4003 => '2026-11-02 15:59:59', 4004 => '2026-11-02 16:00:00'] as $id => $time) DB::table('sensor_readings')->insert($this->sample($id, ['created_at' => $time]));
        $response = $this->getJson('/api/farms/1/house-readings?from=2026-11-02&to=2026-11-02&per_page=50')->assertOk();
        $ids = array_column($response->json('data.items'), 'id');
        $this->assertContains(4003, $ids); $this->assertNotContains(4001, $ids); $this->assertNotContains(4004, $ids);
        $this->assertSame('2026-11-02T15:59:59.000000Z', $response->json('data.items.0.recorded_at'));
        $this->getJson('/api/farms/1/house-readings?from=2026-11-02&to=2026-11-02&page=2&per_page=50')->assertOk()->assertJsonPath('data.items.12.id', 4002);
    }

    public function test_history_remains_accessible_before_house_foundation_installation(): void
    {
        Schema::drop('poultry_houses'); Schema::drop('device_assignment_events');
        Schema::table('sensor_readings', function (Blueprint $t) { $t->dropColumn(['poultry_house_id', 'assignment_event_id']); });
        $this->getJson('/api/farms/1/house-readings?poultry_house_id=unknown')->assertOk()->assertJsonPath('data.total', 61)
            ->assertJsonPath('data.items.0.poultry_house_id', null)->assertJsonPath('data.items.0.house_name', 'House not recorded');
        $this->getJson('/api/farms/1/house-readings?poultry_house_id=11')->assertNotFound();
    }

    public function test_authorization_validation_and_read_only_behavior_are_preserved(): void
    {
        $before = DB::table('sensor_readings')->orderBy('id')->get()->toJson();
        $queries = [];
        DB::listen(function ($query) use (&$queries) { $queries[] = $query->sql; });
        $this->getJson('/api/farms/3/house-readings')->assertNotFound();
        foreach (['per_page=100', 'page=0', 'condition=Offline', 'sensor_id=-1', 'from=2026-11-03&to=2026-11-01'] as $invalid) $this->getJson('/api/farms/1/house-readings?'.$invalid)->assertUnprocessable();
        $this->getJson('/api/farms/1/house-readings?condition=Critical')->assertOk();
        $this->assertSame($before, DB::table('sensor_readings')->orderBy('id')->get()->toJson());
        foreach ($queries as $sql) $this->assertMatchesRegularExpression('/^\s*(select|pragma)\b/i', $sql);
        Http::assertNothingSent(); Mail::assertNothingSent();
    }
}
