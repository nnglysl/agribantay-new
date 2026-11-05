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
        // Dashboards now include annual compliance alongside sensor health.
        Schema::create('maintenance_logs', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('farm_id');
            $table->string('maintenance_type'); $table->date('performed_at');
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
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('user_id')->nullable();
            foreach (['role', 'action', 'details', 'type'] as $field) $table->text($field)->nullable();
            $table->timestamps();
        });
        (require database_path('migrations/2026_10_30_000000_create_device_assignment_events_table.php'))->up();

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

        app(\App\Services\DeviceAssignmentService::class)->change($device->id, $currentFarm->id);
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
        app(\App\Services\DeviceAssignmentService::class)->change($device->id, $currentFarm->id);

        $this->assertNoCurrentAlerts();
    }

    public function test_returning_device_does_not_revive_an_older_reading_from_the_current_farm(): void
    {
        $currentFarm = Farm::create(['farm_name' => 'Return Visit']);
        $otherFarm = Farm::create(['farm_name' => 'Other Farm']);
        $device = $this->device($currentFarm);
        $this->reading($currentFarm, $device, now()->subMinute());
        app(\App\Services\DeviceAssignmentService::class)->change($device->id, $otherFarm->id);
        $this->reading($otherFarm, $device, now());
        app(\App\Services\DeviceAssignmentService::class)->change($device->id, $currentFarm->id);

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

    public function test_monitored_farms_counts_unique_reporting_farms_without_requiring_map_coordinates(): void
    {
        foreach (['Safe', 'Warning', 'Critical'] as $status) {
            $farm = Farm::create(['farm_name' => $status.' Farm']);
            $first = $this->device($farm);
            $this->reading($farm, $first, now(), ['ammonia_status' => $status, 'moisture_status' => $status]);
            $second = $this->device($farm);
            $this->reading($farm, $second, now(), ['ammonia_status' => $status, 'moisture_status' => $status]);
        }
        Farm::create(['farm_name' => 'Inactive Registered Farm', 'status' => 'Inactive']);

        $queries = [];
        DB::listen(function ($query) use (&$queries) { $queries[] = $query->sql; });
        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.total_farms', 4)
            ->assertJsonPath('data.monitored_farms', 3);
        $this->assertCount(0, array_filter($queries, fn ($sql) => preg_match('/^\s*(insert|update|delete|replace|alter|create|drop|truncate)\b/i', $sql)));
        $this->assertSame(6, SensorReading::count());
    }

    public function test_monitored_farms_excludes_offline_inactive_unassigned_stale_and_invalid_readings(): void
    {
        foreach (['offline', 'inactive', 'stale', 'none', 'no-primary', 'invalid-status', 'unassigned'] as $case) {
            $farm = Farm::create(['farm_name' => $case]);
            $device = $case === 'unassigned'
                ? Sensor::create(['label' => 'Unassigned fixture', 'status' => 'Active', 'last_seen_at' => now()])
                : $this->device($farm);
            if ($case === 'offline') $device->update(['last_seen_at' => now()->subMinutes(3)]);
            if ($case === 'inactive') $device->update(['status' => 'Inactive']);
            if ($case === 'none') continue;
            $values = match ($case) {
                'no-primary' => ['ammonia' => null, 'moisture' => null],
                'invalid-status' => ['ammonia_status' => 'Unknown', 'moisture_status' => 'Unknown'],
                default => [],
            };
            $this->reading($farm, $device, $case === 'stale' ? now()->subMinutes(3) : now(), $values);
        }

        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.total_farms', 7)
            ->assertJsonPath('data.monitored_farms', 0);
    }

    public function test_monitored_farms_uses_latest_valid_visit_without_reviving_rotation_history(): void
    {
        $first = Farm::create(['farm_name' => 'First visit']);
        $second = Farm::create(['farm_name' => 'Second visit']);
        $device = $this->device($first);
        $historical = $this->reading($first, $device, now());
        $original = $historical->fresh()->getAttributes();
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.monitored_farms', 1);

        app(\App\Services\DeviceAssignmentService::class)->change($device->id, $second->id);
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.monitored_farms', 0);
        $this->reading($second, $device, now());
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.monitored_farms', 1);

        app(\App\Services\DeviceAssignmentService::class)->change($device->id, $first->id);
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.monitored_farms', 0);
        $this->assertSame($original, $historical->fresh()->getAttributes());
    }

    public function test_monitored_farms_uses_existing_primary_validity_and_never_falls_back_to_old_values(): void
    {
        $farm = Farm::create(['farm_name' => 'Primary completeness']);
        $device = $this->device($farm);
        $this->reading($farm, $device, now(), ['ammonia' => 0, 'moisture' => null, 'ammonia_status' => 'Safe']);
        // The existing reporting_devices/has_current_primary policy includes
        // partial valid primary data; it never labels that coverage complete.
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.monitored_farms', 1);
        $this->reading($farm, $device, now(), ['ammonia' => null, 'moisture' => null]);
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.monitored_farms', 0);
        $this->reading($farm, $device, now()->addMinute());
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.monitored_farms', 0);
    }

    public function test_dashboard_keeps_authoritative_annual_compliance_and_all_registered_farm_total(): void
    {
        $this->travelTo(\Illuminate\Support\Carbon::parse('2026-11-03 04:00:00', 'UTC'));
        $compliant = Farm::create(['farm_name' => 'Compliant on anniversary']);
        $nonCompliant = Farm::create(['farm_name' => 'Past annual deadline']);
        $undetermined = Farm::create(['farm_name' => 'Unknown registration']);
        $inactive = Farm::create(['farm_name' => 'Inactive registration', 'status' => 'Inactive']);
        DB::table('farms')->where('id', $compliant->id)->update(['created_at' => '2025-11-03 04:00:00']);
        DB::table('farms')->where('id', $nonCompliant->id)->update(['created_at' => '2025-11-02 04:00:00']);
        DB::table('farms')->where('id', $undetermined->id)->update(['created_at' => null]);
        DB::table('farms')->where('id', $inactive->id)->update(['created_at' => '2024-01-01 04:00:00']);
        $expected = app(\App\Services\MaintenanceStatusService::class)->summary(
            Farm::where('status', 'Active')->with('qualifyingCleanouts')->get()
        );

        $response = $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.total_farms', 4)
            ->assertJsonPath('data.cleanout_compliance.compliant', 1)
            ->assertJsonPath('data.cleanout_compliance.non_compliant', 1)
            ->assertJsonPath('data.cleanout_compliance.undetermined', 1);
        $this->assertSame($expected, $response->json('data.cleanout_compliance'));
    }

    public function test_monitored_farms_aggregate_preserves_staff_response_and_dashboard_role_authorization(): void
    {
        $this->actingAs(User::create(['role' => 'admin', 'status' => 'active']), 'sanctum');
        $response = $this->getJson('/api/admin/dashboard')->assertOk();
        $this->assertArrayNotHasKey('monitored_farms', $response->json('data'));
        $this->actingAs(User::create(['role' => 'vet', 'status' => 'active']), 'sanctum');
        $this->getJson('/api/admin/dashboard')->assertForbidden();
    }

    private function assertNoCurrentAlerts(): void
    {
        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.critical_alerts', 0)
            ->assertJsonCount(0, 'data.critical_farms');
    }

    private function device(Farm $farm, array $overrides = []): Sensor
    {
        $device = Sensor::create([
            'label' => 'AGB-TEST-'.(Sensor::count() + 1),
            'status' => 'Active',
            'last_seen_at' => now(),
        ]);
        $device = app(\App\Services\DeviceAssignmentService::class)->change($device->id, $farm->id);
        $device->update($overrides);
        return $device;
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
