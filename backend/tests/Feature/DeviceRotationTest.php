<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\FarmStatusService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 1 IoT preparation — 2 physical devices rotated across 10 farms.
 *
 * Runs against the real MySQL connection (phpunit.xml's SQLite override is
 * unusable here because several migrations use MySQL-only ALTER ... ENUM
 * statements), so it is skipped under the default config. Run it with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=DeviceRotationTest
 *
 * Every test is wrapped in a transaction that is rolled back,
 * so nothing is left in the development database.
 */
class DeviceRotationTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=DeviceRotationTest');
        }

        // Never hit the real SMS gateway when a farm status flips.
        Http::fake();
    }

    private function makeFarm(string $name): Farm
    {
        $owner = User::create([
            'first_name'    => 'Test',
            'last_name'     => Str::random(6),
            'email'         => Str::lower(Str::random(10)) . '@test.local',
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password'      => bcrypt('password'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => $name,
            'owner_name'    => 'Test Owner',
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Test',
            'municipality'  => 'San Jose',
            'province'      => 'Batangas',
            'address'       => 'Test',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    private function makeDevice(?Farm $farm, string $status = 'Active'): Sensor
    {
        $n = Str::upper(Str::random(5));

        return Sensor::create([
            'farm_id'    => $farm?->id,
            'device_key' => "AGB-T{$n}-" . Str::upper(Str::random(5)),
            'label'      => "AGB-T{$n}",
            'status'     => $status,
        ]);
    }

    private function payload(Sensor $sensor, array $overrides = []): array
    {
        return array_merge([
            'device_key'  => $sensor->device_key,
            'temperature' => 29.4,
            'humidity'    => 72.3,
            'soil_raw'    => 1850,
            'ammonia_raw' => 500,
        ], $overrides);
    }

    private function admin(): User
    {
        return User::create([
            'first_name'    => 'Admin',
            'last_name'     => Str::random(6),
            'email'         => Str::lower(Str::random(10)) . '@test.local',
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password'      => bcrypt('password'),
            'role'          => 'admin',
            'status'        => 'active',
        ]);
    }

    /** Test 1 — assigned, active device is accepted and stamps farm/sensor/last_seen_at. */
    public function test_assigned_active_device_reading_is_accepted(): void
    {
        $farm   = $this->makeFarm('Farm 1');
        $device = $this->makeDevice($farm);
        $this->assertNull($device->last_seen_at);

        $res = $this->postJson('/api/sensor-readings', $this->payload($device));

        $res->assertOk()->assertJsonPath('success', true);

        $reading = SensorReading::latest('id')->first();
        $this->assertSame($farm->id, $reading->farm_id);
        $this->assertSame($device->id, $reading->sensor_id);
        $this->assertFalse((bool) $reading->is_mock);
        $this->assertNotNull($device->fresh()->last_seen_at);
        $this->assertSame('Online', app(FarmStatusService::class)->connectivity($farm->fresh()));
    }

    /** Test 2 — unknown key is rejected, nothing written. */
    public function test_unknown_device_key_is_rejected(): void
    {
        $before = SensorReading::count();

        $res = $this->postJson('/api/sensor-readings', [
            'device_key' => 'AGB-NOPE-00000', 'temperature' => 29, 'humidity' => 70, 'soil_raw' => 1800, 'ammonia_raw' => 400,
        ]);

        $res->assertStatus(401);
        $this->assertSame($before, SensorReading::count());
    }

    /** Test 3 — unassigned device (farm_id NULL) is rejected, last_seen_at untouched. */
    public function test_unassigned_device_is_rejected(): void
    {
        $device = $this->makeDevice(null);
        $before = SensorReading::count();

        $res = $this->postJson('/api/sensor-readings', $this->payload($device));

        $res->assertStatus(409);
        $this->assertSame($before, SensorReading::count());
        $this->assertNull($device->fresh()->last_seen_at);
    }

    /** Test 4 — inactive device is rejected, last_seen_at untouched. */
    public function test_inactive_device_is_rejected(): void
    {
        $device = $this->makeDevice($this->makeFarm('Farm X'), 'Inactive');
        $before = SensorReading::count();

        $res = $this->postJson('/api/sensor-readings', $this->payload($device));

        $res->assertStatus(403);
        $this->assertSame($before, SensorReading::count());
        $this->assertNull($device->fresh()->last_seen_at);
    }

    /** Test 5 — reassignment: old readings keep the old farm, new readings get the new farm. */
    public function test_reassignment_preserves_historical_farm_on_old_readings(): void
    {
        $farm1  = $this->makeFarm('Farm 1');
        $farm3  = $this->makeFarm('Farm 3');
        $device = $this->makeDevice($farm1);
        $admin  = $this->admin();

        $this->postJson('/api/sensor-readings', $this->payload($device))->assertOk();
        $oldReading = SensorReading::latest('id')->first();
        $this->assertSame($farm1->id, $oldReading->farm_id);

        // Admin moves the physical unit: Farm 1 -> (unassign) -> Farm 3.
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$device->id}/unassign")->assertOk();
        $this->assertNull($device->fresh()->farm_id);
        $this->assertSame('Pending Setup', app(FarmStatusService::class)->connectivity($farm1->fresh()));

        // While in transit the device must not write anywhere.
        $this->postJson('/api/sensor-readings', $this->payload($device))->assertStatus(409);

        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$device->id}/assign", ['farm_id' => $farm3->id])
            ->assertOk()->assertJsonPath('data.farm_id', $farm3->id);

        // Identity is untouched by the move.
        $fresh = $device->fresh();
        $this->assertSame($device->device_key, $fresh->device_key);
        $this->assertSame($device->label, $fresh->label);
        $this->assertSame($device->id, $fresh->id);
        $this->assertSame(1, Sensor::where('device_key', $device->device_key)->count());

        $this->postJson('/api/sensor-readings', $this->payload($device))->assertOk();
        $newReading = SensorReading::latest('id')->first();
        $this->assertSame($farm3->id, $newReading->farm_id);
        $this->assertSame($device->id, $newReading->sensor_id);

        // THE critical assertion: the Farm 1 reading did not follow the device.
        $this->assertSame($farm1->id, $oldReading->fresh()->farm_id);
        $this->assertSame(1, SensorReading::where('sensor_id', $device->id)->where('farm_id', $farm1->id)->count());
        $this->assertSame(1, SensorReading::where('sensor_id', $device->id)->where('farm_id', $farm3->id)->count());

        // Direct reassign (no unassign step) also works and is rejected as a no-op to the same farm.
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$device->id}/assign", ['farm_id' => $farm3->id])->assertStatus(422);
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$device->id}/assign", ['farm_id' => $farm1->id])->assertOk();
        $this->assertSame($farm1->id, $device->fresh()->farm_id);
    }

    /** Test 6 — connectivity is time-based, not "has ever had a reading". */
    public function test_connectivity_states(): void
    {
        $service = app(FarmStatusService::class);
        $timeout = config('sensors.offline_after_minutes');

        $noDevice = $this->makeFarm('No device');
        $this->assertSame('Pending Setup', $service->connectivity($noDevice));

        $farm   = $this->makeFarm('Farm');
        $device = $this->makeDevice($farm);
        // Assigned but never communicated -> Offline, not Pending Setup.
        $this->assertSame('Offline', $service->connectivity($farm->fresh()));

        $device->forceFill(['last_seen_at' => now()->subMinutes($timeout - 1)])->save();
        $this->assertSame('Online', $service->connectivity($farm->fresh()));

        $device->forceFill(['last_seen_at' => now()->subMinutes($timeout + 1)])->save();
        $this->assertSame('Offline', $service->connectivity($farm->fresh()));

        // A reading exists, but the device is Inactive -> Pending Setup.
        $device->forceFill(['last_seen_at' => now(), 'status' => 'Inactive'])->save();
        $this->assertSame('Pending Setup', $service->connectivity($farm->fresh()));
    }

    /** Faulty soil probe (raw 0) must not crash on the strict moisture_status enum. */
    public function test_faulty_soil_probe_does_not_break_ingestion(): void
    {
        $farm   = $this->makeFarm('Farm');
        $device = $this->makeDevice($farm);

        // Establish a previous moisture status (wet -> Critical: raw 500 -> ~87.8%).
        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 500]))->assertOk();
        $this->assertSame('Critical', SensorReading::latest('id')->first()->moisture_status);

        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 0]))->assertOk();
        $reading = SensorReading::latest('id')->first();
        $this->assertNull($reading->moisture);
        $this->assertSame('Critical', $reading->moisture_status, 'status carried forward while probe is faulty');

        // No prior reading at all -> Safe.
        $farm2   = $this->makeFarm('Farm 2');
        $device2 = $this->makeDevice($farm2);
        $this->postJson('/api/sensor-readings', $this->payload($device2, ['soil_raw' => 0]))->assertOk();
        $this->assertSame('Safe', SensorReading::latest('id')->first()->moisture_status);
    }

    /** Registration accepts a permanent label; the Device Key stays immutable. */
    public function test_registration_with_permanent_device_name(): void
    {
        $farm  = $this->makeFarm('Farm');
        $admin = $this->admin();
        $name  = 'AGB-T' . Str::upper(Str::random(4));
        $key   = $name . '-' . Str::upper(Str::random(5));

        $res = $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'farm_id' => $farm->id, 'label' => $name, 'device_key' => $key, 'installed_at' => now()->toDateString(),
        ]);

        $res->assertOk()->assertJsonPath('data.device_name', $name)->assertJsonPath('data.connectivity', 'Offline');

        // Duplicate name / key rejected.
        $this->actingAs($admin)->postJson('/api/admin/sensors', ['farm_id' => $farm->id, 'label' => $name, 'device_key' => $key . 'X'])
            ->assertStatus(422);

        // Device key not editable through update().
        $id = $res->json('data.id');
        $this->actingAs($admin)->putJson("/api/admin/sensors/{$id}", ['status' => 'Inactive', 'device_key' => 'HACKED'])->assertOk();
        $this->assertSame($key, Sensor::find($id)->device_key);

        // Farmer dashboard payload never contains the device key.
        $farmer = $farm->user;
        $dash = $this->actingAs($farmer)->getJson('/api/farmer/dashboard')->assertOk();
        $this->assertStringNotContainsString($key, $dash->getContent());
        $this->assertSame('Pending Setup', $dash->json('data.connectivity')); // device is now Inactive
    }
}
