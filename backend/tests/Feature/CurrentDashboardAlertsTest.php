<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CurrentDashboardAlertsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // These fixtures use only a private in-memory database, never the
        // development database or the project's migrations.
        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
            'database.connections.sqlite.url' => null,
            'sensors.offline_after_minutes' => 3,
            'sensors.alerting_metrics' => ['ammonia', 'moisture'],
        ]);
        DB::purge('sqlite');
        Http::preventStrayRequests();
        $this->travelTo(now()->startOfSecond());

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('role');
            $table->string('status');
            $table->timestamps();
        });
        Schema::create('farms', function (Blueprint $table) {
            $table->id();
            $table->string('farm_name');
            $table->string('status')->default('Active');
            $table->string('current_status')->default('Critical');
            $table->timestamps();
        });
        Schema::create('sensors', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('farm_id')->nullable();
            $table->string('label')->nullable();
            $table->string('sensor_code')->nullable();
            $table->date('installed_at')->nullable();
            $table->string('status')->default('Active');
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });
        Schema::create('sensor_readings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('farm_id');
            $table->unsignedBigInteger('sensor_id');
            foreach (['ammonia', 'temperature', 'humidity', 'moisture'] as $metric) {
                $table->decimal($metric, 8, 2)->nullable();
                $table->string($metric.'_status')->default('Safe');
            }
            $table->boolean('is_mock')->default(false);
            $table->timestamps();
        });
        Schema::create('service_requests', function (Blueprint $table) {
            $table->id();
            $table->string('service_type');
            $table->string('status');
        });
        Schema::create('inspections', function (Blueprint $table) {
            $table->id();
            $table->string('status');
            $table->timestamp('scheduled_at')->nullable();
        });
        Schema::create('alert_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('farm_id');
            $table->string('status');
            $table->timestamp('triggered_at');
            $table->timestamp('resolved_at')->nullable();
        });
        Schema::create('sms_logs', fn (Blueprint $table) => $table->id());

        $this->actingAs(User::create(['role' => 'super_admin', 'status' => 'active']), 'sanctum');
    }

    public function test_reassignment_removes_old_farm_from_current_alerts_and_preserves_history(): void
    {
        $oldFarm = Farm::create(['farm_name' => "Joana's Farm"]);
        $currentFarm = Farm::create(['farm_name' => 'RJ ANDAL FARM']);
        $device = $this->device($oldFarm);
        $oldReading = $this->reading($oldFarm, $device, now()->subDays(3));
        DB::table('alert_history')->insert([
            'farm_id' => $oldFarm->id,
            'status' => 'Critical',
            'triggered_at' => now()->subDays(3),
            'resolved_at' => null,
        ]);
        $incident = DB::table('alert_history')->first();

        $device->update(['farm_id' => $currentFarm->id]);
        $this->reading($currentFarm, $device, now(), ['ammonia_status' => 'Critical']);

        $response = $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.critical_alerts', 1)
            ->assertJsonCount(1, 'data.critical_farms')
            ->assertJsonPath('data.critical_farms.0.farm_id', $currentFarm->id)
            ->assertJsonPath('data.critical_farms.0.critical_count', 2);

        $metrics = collect($response->json('data.critical_farms.0.all_sensors'))->keyBy('type');
        $this->assertTrue($metrics['Ammonia']['critical']);
        $this->assertTrue($metrics['Moisture']['critical']);
        $this->assertSame('Critical', $oldFarm->fresh()->current_status);
        $this->assertSame($oldFarm->id, $oldReading->fresh()->farm_id);
        $this->assertSame(2, SensorReading::count());
        $this->assertEquals($incident, DB::table('alert_history')->first());
        $this->assertSame(0, DB::table('sms_logs')->count());
    }

    public function test_reassigned_device_needs_a_reading_from_its_new_farm(): void
    {
        $oldFarm = Farm::create(['farm_name' => 'Previous Farm']);
        $currentFarm = Farm::create(['farm_name' => 'New Farm']);
        $device = $this->device($oldFarm);
        $this->reading($oldFarm, $device, now());
        $device->update(['farm_id' => $currentFarm->id]);

        $this->assertNoCurrentAlerts();
    }

    public function test_returning_device_does_not_revive_an_older_reading_from_the_current_farm(): void
    {
        $currentFarm = Farm::create(['farm_name' => 'Return Visit']);
        $otherFarm = Farm::create(['farm_name' => 'Other Farm']);
        $device = $this->device($currentFarm);
        $this->reading($currentFarm, $device, now()->subMinute());
        $this->reading($otherFarm, $device, now());

        $this->assertNoCurrentAlerts();
    }

    public function test_offline_and_inactive_devices_are_excluded(): void
    {
        $offlineFarm = Farm::create(['farm_name' => 'Offline Farm']);
        $offline = $this->device($offlineFarm, ['last_seen_at' => now()->subMinutes(3)]);
        $this->reading($offlineFarm, $offline, now());
        $inactiveFarm = Farm::create(['farm_name' => 'Inactive Device Farm']);
        $inactive = $this->device($inactiveFarm, ['status' => 'Inactive']);
        $this->reading($inactiveFarm, $inactive, now());

        $this->assertNoCurrentAlerts();
    }

    public function test_reporting_house_does_not_make_another_houses_old_critical_reading_current(): void
    {
        $farm = Farm::create(['farm_name' => 'Two Houses']);
        $stale = $this->device($farm);
        $reporting = $this->device($farm);
        $this->reading($farm, $stale, now()->subMinutes(3));
        $this->reading($farm, $reporting, now(), ['moisture_status' => 'Safe']);

        $this->assertNoCurrentAlerts();
        $this->assertSame('Critical', $farm->fresh()->current_status);
    }

    public function test_fresh_critical_reading_does_not_depend_on_the_cached_farm_status(): void
    {
        $farm = Farm::create(['farm_name' => 'Fresh Critical', 'current_status' => 'Safe']);
        $device = $this->device($farm);
        $this->reading($farm, $device, now());

        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.critical_alerts', 1)
            ->assertJsonPath('data.critical_farms.0.farm_id', $farm->id);
        $this->assertSame('Safe', $farm->fresh()->current_status);
    }

    public function test_newest_row_wins_when_two_readings_share_the_same_timestamp(): void
    {
        $farm = Farm::create(['farm_name' => 'Same Second']);
        $device = $this->device($farm);
        $this->reading($farm, $device, now());
        $this->reading($farm, $device, now(), ['moisture_status' => 'Safe']);

        $this->assertNoCurrentAlerts();
    }

    public function test_carried_critical_status_without_a_measurement_does_not_hide_a_reporting_house(): void
    {
        $farm = Farm::create(['farm_name' => 'Faulty Probe and Reporting House']);
        $faulty = $this->device($farm);
        $reporting = $this->device($farm);
        $this->reading($farm, $faulty, now(), ['moisture' => null]);
        $this->reading($farm, $reporting, now(), [
            'ammonia_status' => 'Critical',
            'moisture_status' => 'Safe',
        ]);

        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.critical_alerts', 1)
            ->assertJsonPath('data.critical_farms.0.critical_count', 1)
            ->assertJsonPath('data.critical_farms.0.all_sensors.0.critical', true)
            ->assertJsonPath('data.critical_farms.0.all_sensors.3.critical', false);
    }

    private function assertNoCurrentAlerts(): void
    {
        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.critical_alerts', 0)
            ->assertJsonCount(0, 'data.critical_farms');
    }

    private function device(Farm $farm, array $overrides = []): Sensor
    {
        return Sensor::create(array_merge([
            'farm_id' => $farm->id,
            'label' => 'AGB-TEST-'.(Sensor::count() + 1),
            'status' => 'Active',
            'last_seen_at' => now(),
        ], $overrides));
    }

    private function reading(Farm $farm, Sensor $device, $at, array $overrides = []): SensorReading
    {
        $reading = new SensorReading(array_merge([
            'farm_id' => $farm->id,
            'sensor_id' => $device->id,
            'ammonia' => 80.62,
            'ammonia_status' => 'Safe',
            'temperature' => 28.9,
            'temperature_status' => 'Critical',
            'humidity' => 74.9,
            'humidity_status' => 'Critical',
            'moisture' => 40,
            'moisture_status' => 'Critical',
            'is_mock' => false,
        ], $overrides));
        $reading->forceFill(['created_at' => $at, 'updated_at' => $at])->save();

        return $reading;
    }
}
