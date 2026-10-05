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

    /** A valid pre-provisioned key, in the format the command produces. */
    private function provisionedKey(): string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $s = '';
        for ($i = 0; $i < 8; $i++) {
            $s .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return 'AGB-' . $s;
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

    /**
     * Replacement workflow: unassign the damaged device, register a new one
     * with its own Device Key on the same farm, and verify the old readings
     * stay put while new ones use the new device.
     */
    public function test_replacement_device_workflow(): void
    {
        $farm  = $this->makeFarm('Farm 1');
        $admin = $this->admin();
        $old   = $this->makeDevice($farm);

        $this->postJson('/api/sensor-readings', $this->payload($old))->assertOk();
        $oldReading = SensorReading::latest('id')->first();

        $n = Str::upper(Str::random(5));

        // A farm can monitor several poultry houses, so a second device is
        // accepted alongside the first — both stay assigned to this farm.
        $spare = $this->makeDevice(null);
        $this->actingAs($admin)
            ->patchJson("/api/admin/sensors/{$spare->id}/assign", ['farm_id' => $farm->id])
            ->assertOk();
        $this->assertSame($farm->id, $spare->fresh()->farm_id);
        $this->assertSame($farm->id, $old->fresh()->farm_id);

        // Park the spare again so the rest of this test exercises the
        // one-unit replacement flow it was written for.
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$spare->id}/unassign")->assertOk();

        // 1. Unassign the damaged unit — record and readings survive.
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$old->id}/unassign")->assertOk();
        $this->assertNotNull(Sensor::find($old->id));
        $this->assertSame($old->device_key, Sensor::find($old->id)->device_key);
        $this->assertSame($farm->id, $oldReading->fresh()->farm_id);
        $this->assertSame($old->id, $oldReading->fresh()->sensor_id);
        $this->assertSame('Pending Setup', app(FarmStatusService::class)->connectivity($farm->fresh()));

        // 2. The retired device can no longer send readings.
        $this->postJson('/api/sensor-readings', $this->payload($old))->assertStatus(409);

        // 3. Register the replacement — the backend issues it a fresh key,
        //    then it is assigned to the same farm.
        $new = $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'label' => "AGB-T{$n}", 'device_key' => $this->provisionedKey(),
        ])->assertOk();
        $newId = $new->json('data.id');
        $this->assertNotSame($old->id, $newId);

        // The replacement can never inherit the retired unit's key.
        $this->assertNotSame($old->device_key, $new->json('data.device_key'));

        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$newId}/assign", ['farm_id' => $farm->id])
            ->assertOk();

        // 4. New readings: same farm, new sensor.
        $this->postJson('/api/sensor-readings', $this->payload(Sensor::find($newId)))->assertOk();
        $newReading = SensorReading::latest('id')->first();
        $this->assertSame($farm->id, $newReading->farm_id);
        $this->assertSame($newId, $newReading->sensor_id);

        // 5. The old reading still points at the old device and the same farm.
        $this->assertSame($old->id, $oldReading->fresh()->sensor_id);
        $this->assertSame($farm->id, $oldReading->fresh()->farm_id);
    }

    /**
     * The full weekly thesis rotation, driven through exactly the endpoints
     * the Devices tab calls — Unassign, then "Assign to this farm" from the
     * Unassigned Devices list. No Reassign endpoint call, no second Sensor
     * row, and Farm A's week of data is left untouched.
     */
    public function test_weekly_rotation_via_unassign_then_assign(): void
    {
        $farmA = $this->makeFarm('Farm A');
        $farmB = $this->makeFarm('Farm B');
        $admin = $this->admin();
        $status = app(FarmStatusService::class);

        // 1-2. Device 1 on Farm A collects a week of readings.
        $device = $this->makeDevice($farmA);
        $this->postJson('/api/sensor-readings', $this->payload($device, ['temperature' => 28.1]))->assertOk();
        $this->postJson('/api/sensor-readings', $this->payload($device, ['temperature' => 30.2]))->assertOk();
        $farmAReadings = SensorReading::where('sensor_id', $device->id)->orderBy('id')->get();
        $this->assertCount(2, $farmAReadings);
        $this->assertSame('Online', $status->connectivity($farmA->fresh()));
        $seenOnFarmA = $device->fresh()->last_seen_at;
        $this->assertNotNull($seenOnFarmA);

        // 3-4. Admin unassigns. The device row survives with its key intact.
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$device->id}/unassign")->assertOk();
        $unassigned = $device->fresh();
        $this->assertNull($unassigned->farm_id);
        $this->assertSame($device->device_key, $unassigned->device_key);
        $this->assertSame($device->label, $unassigned->label);

        // 5. Farm A has no other active device -> Pending Setup.
        $this->assertSame('Pending Setup', $status->connectivity($farmA->fresh()));

        // 6. Farm A's readings are untouched by the unassign.
        foreach ($farmAReadings as $r) {
            $this->assertSame($farmA->id, $r->fresh()->farm_id);
            $this->assertSame($device->id, $r->fresh()->sensor_id);
        }

        // 7. While unassigned the device is refused, and last_seen_at does not move.
        $this->postJson('/api/sensor-readings', $this->payload($device))->assertStatus(409);
        $this->assertEquals($seenOnFarmA, $device->fresh()->last_seen_at);

        // 8-9. The device shows up in the Unassigned Devices list the tab reads.
        $pool = $this->actingAs($admin)->getJson('/api/admin/sensors')->assertOk()->json('data');
        $poolIds = collect($pool)->whereNull('farm_id')->pluck('id');
        $this->assertTrue($poolIds->contains($device->id));
        $this->assertSame('Unassigned', collect($pool)->firstWhere('id', $device->id)['connectivity']);

        // 10. "Assign to this farm" on Farm B.
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$device->id}/assign", ['farm_id' => $farmB->id])
            ->assertOk()->assertJsonPath('data.farm_id', $farmB->id);
        $this->assertSame(1, Sensor::where('device_key', $device->device_key)->count(), 'no duplicate Sensor row');
        $this->assertSame($device->id, Sensor::where('device_key', $device->device_key)->first()->id);

        // 11. New readings land on Farm B. (last_seen_at has second precision,
        //     so move the clock on to prove it really was rewritten.)
        $this->travel(5)->seconds();
        $this->postJson('/api/sensor-readings', $this->payload($device, ['temperature' => 31.5]))->assertOk();
        $newReading = SensorReading::latest('id')->first();
        $this->assertSame($farmB->id, $newReading->farm_id);
        $this->assertSame($device->id, $newReading->sensor_id);
        $this->assertTrue($device->fresh()->last_seen_at->gt($seenOnFarmA));
        $this->assertSame('Online', $status->connectivity($farmB->fresh()));

        // 12. Farm A keeps exactly its two original readings; Farm A is still
        //     Pending Setup and never inherits Farm B's data.
        $this->assertSame(2, SensorReading::where('sensor_id', $device->id)->where('farm_id', $farmA->id)->count());
        $this->assertSame(1, SensorReading::where('sensor_id', $device->id)->where('farm_id', $farmB->id)->count());
        $this->assertSame('Pending Setup', $status->connectivity($farmA->fresh()));
        $this->assertEqualsCanonicalizing(
            $farmAReadings->pluck('temperature')->all(),
            SensorReading::where('farm_id', $farmA->id)->pluck('temperature')->all()
        );

        // The rotation is logged for the thesis audit trail.
        $this->assertDatabaseHas('activity_logs', ['action' => 'Unassigned Sensor']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'Assigned Sensor']);
    }

    /**
     * A farm runs one device per poultry house, so several Active devices can
     * sit on the same farm at once and both keep sending readings.
     */
    public function test_farm_can_hold_several_active_devices(): void
    {
        $farm   = $this->makeFarm('Farm A');
        $admin  = $this->admin();
        $first  = $this->makeDevice($farm);
        $second = $this->makeDevice(null);

        $this->actingAs($admin)
            ->patchJson("/api/admin/sensors/{$second->id}/assign", ['farm_id' => $farm->id])
            ->assertOk();

        $this->assertSame($farm->id, $first->fresh()->farm_id);
        $this->assertSame($farm->id, $second->fresh()->farm_id);
        $this->assertSame(2, Sensor::where('farm_id', $farm->id)->where('status', 'Active')->count());

        // Both are accepted at ingestion, and each reading is stamped with the
        // device that sent it so the two streams stay separable.
        $this->postJson('/api/sensor-readings', $this->payload($first))->assertOk();
        $this->postJson('/api/sensor-readings', $this->payload($second))->assertOk();

        $this->assertSame(1, SensorReading::where('sensor_id', $first->id)->count());
        $this->assertSame(1, SensorReading::where('sensor_id', $second->id)->count());
        $this->assertSame(2, SensorReading::where('farm_id', $farm->id)->count());
    }

    /**
     * The Device Key is a credential: only the Admin/Super Admin device
     * endpoints may return it, and it is never written to the Activity Logs.
     */
    public function test_device_key_is_not_exposed_to_farmers_or_activity_logs(): void
    {
        $farm  = $this->makeFarm('Farm A');
        $admin = $this->admin();
        $n     = Str::upper(Str::random(5));

        // The key comes back from registration — it is generated, not supplied.
        $key = $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'label' => "AGB-T{$n}", 'device_key' => $this->provisionedKey(),
        ])->assertOk()->json('data.device_key');

        $this->actingAs($admin)->patchJson(
            '/api/admin/sensors/' . Sensor::where('device_key', $key)->value('id') . '/assign',
            ['farm_id' => $farm->id]
        )->assertOk();

        // Registering must not leak the key into the audit trail.
        $this->assertSame(0, \App\Models\ActivityLog::where('details', 'like', "%{$key}%")->count());

        // Even a legacy row that still holds a key is redacted on display,
        // without the stored audit record being rewritten.
        $legacy = \App\Models\ActivityLog::create([
            'user_id' => $admin->id,
            'role'    => 'admin',
            'action'  => 'Registered Sensor',
            'details' => "Registered device Device 1 ({$key}) for {$farm->farm_name}",
            'type'    => 'Farm',
        ]);

        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => Str::random(6),
            'email' => Str::lower(Str::random(10)) . '@test.local',
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password' => bcrypt('password'), 'role' => 'super_admin', 'status' => 'active',
        ]);

        $logs = $this->actingAs($superAdmin)->getJson('/api/superadmin/activity-logs')->assertOk();
        $this->assertStringNotContainsString($key, $logs->getContent());
        $shown = collect($logs->json('data'))->firstWhere('id', $legacy->id);
        $this->assertSame("Registered device Device 1 for {$farm->farm_name}", $shown['details']);
        // The stored row is untouched — nothing is deleted or rewritten.
        $this->assertStringContainsString($key, $legacy->fresh()->details);

        $sensor = Sensor::where('device_key', $key)->first();
        $this->postJson('/api/sensor-readings', $this->payload($sensor))->assertOk();

        // Farmer-facing payloads never carry it.
        $owner = $farm->user;
        foreach (['/api/farmer/dashboard', '/api/farmer/farms'] as $url) {
            $res = $this->actingAs($owner)->getJson($url);
            if ($res->status() === 200) {
                $this->assertStringNotContainsString($key, $res->getContent(), "{$url} leaked the device key");
            }
        }

        // Admin device endpoints still return it so the UI can reveal/copy it.
        $this->assertStringContainsString(
            $key,
            $this->actingAs($admin)->getJson("/api/admin/farms/{$farm->id}/sensors")->assertOk()->getContent()
        );
        $this->assertStringContainsString(
            $key,
            $this->actingAs($admin)->getJson('/api/admin/sensors')->assertOk()->getContent()
        );
    }

    /**
     * Registration saves the pre-provisioned key EXACTLY as submitted. The
     * firmware is already flashed with it, so any alteration here would leave
     * a device that can never authenticate.
     */
    public function test_registration_saves_the_submitted_device_key(): void
    {
        $admin = $this->admin();
        $key   = $this->provisionedKey();

        $res = $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'device_key' => $key,
            'label'      => 'PreProv ' . Str::random(6),
        ])->assertOk();

        // Returned unchanged...
        $this->assertSame($key, $res->json('data.device_key'));

        // ...and persisted unchanged. No new key was generated.
        $sensor = Sensor::findOrFail($res->json('data.id'));
        $this->assertSame($key, $sensor->device_key);
        $this->assertSame(1, Sensor::where('device_key', $key)->count());

        // The device can immediately authenticate with that exact key.
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$sensor->id}/assign", [
            'farm_id' => $this->makeFarm('Farm A')->id,
        ])->assertOk();

        $this->postJson('/api/sensor-readings', $this->payload($sensor))->assertOk();
    }

    /** Missing, malformed, or duplicate keys are all refused. */
    public function test_device_key_is_required_and_validated(): void
    {
        $admin  = $this->admin();
        $before = Sensor::count();

        // Missing entirely.
        $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'label' => 'NoKey ' . Str::random(6),
        ])->assertStatus(422)->assertJsonValidationErrors('device_key');

        $malformed = [
            'abc',                      // too short, no prefix
            'agb-abcdefgh',             // lowercase
            'AGB-ABCDEFG',              // 7 chars
            'AGB-ABCDEFGHI',            // 9 chars
            'AGB ABCDEFGH',             // space instead of hyphen
            'XYZ-ABCDEFGH',             // wrong prefix
            'AGB-ABCDEF0H',             // contains 0 — excluded, likely a misread O
            'AGB-ABCDEFOH',             // contains O — excluded, likely a misread 0
            'AGB-ABCDEF1H',             // contains 1
            'AGB-ABCDEFIH',             // contains I
            'AGB-ABCDEFLH',             // contains L
            'AGB-ABCD@FGH',             // illegal character
        ];

        foreach ($malformed as $bad) {
            $this->actingAs($admin)->postJson('/api/admin/sensors', [
                'device_key' => $bad, 'label' => 'Bad ' . Str::random(8),
            ])->assertStatus(422, "expected rejection for: {$bad}");
        }

        // Nothing was created by any of the above.
        $this->assertSame($before, Sensor::count());

        // A duplicate of an already-registered key is refused.
        $key = $this->provisionedKey();
        $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'device_key' => $key, 'label' => 'First ' . Str::random(6),
        ])->assertOk();

        $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'device_key' => $key, 'label' => 'Second ' . Str::random(6),
        ])->assertStatus(422)->assertJsonValidationErrors('device_key');

        $this->assertSame(1, Sensor::where('device_key', $key)->count());
    }

    /** Every newly registered device starts Unassigned, then can be assigned. */
    public function test_device_is_registered_unassigned(): void
    {
        $admin = $this->admin();
        $farm  = $this->makeFarm('Farm A');

        // Even when a farm_id is supplied, the device starts Unassigned.
        $res = $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'farm_id' => $farm->id, 'label' => 'Unassigned ' . Str::random(5), 'device_key' => $this->provisionedKey(),
        ])->assertOk();

        $key = $res->json('data.device_key');

        $this->assertNull($res->json('data.farm_id'));
        $this->assertSame('Unassigned', $res->json('data.connectivity'));

        $sensor = Sensor::where('device_key', $key)->firstOrFail();
        $this->assertNull($sensor->farm_id);
        $this->assertSame('Active', $sensor->status);

        // It shows up in the pool the Devices tab reads.
        $pool = $this->actingAs($admin)->getJson('/api/admin/sensors')->assertOk()->json('data');
        $this->assertTrue(collect($pool)->whereNull('farm_id')->pluck('id')->contains($sensor->id));

        // It cannot post readings until assigned.
        $this->postJson('/api/sensor-readings', $this->payload($sensor))->assertStatus(409);

        // Assigning works, and the identity is unchanged.
        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$sensor->id}/assign", ['farm_id' => $farm->id])
            ->assertOk();
        $this->assertSame($farm->id, $sensor->fresh()->farm_id);
        $this->assertSame($key, $sensor->fresh()->device_key);

        $this->postJson('/api/sensor-readings', $this->payload($sensor))->assertOk();
        $this->assertSame($farm->id, SensorReading::latest('id')->first()->farm_id);
    }

    /** Only Admin/Super Admin may register devices (and so obtain a key). */
    public function test_registration_requires_admin(): void
    {
        $farm  = $this->makeFarm('Farm A');
        $owner = $farm->user;

        $this->postJson('/api/admin/sensors', ['label' => 'Anon ' . Str::random(6), 'device_key' => $this->provisionedKey()])->assertStatus(401);
        $this->actingAs($owner)->postJson('/api/admin/sensors', ['label' => 'Owner ' . Str::random(6), 'device_key' => $this->provisionedKey()])
            ->assertStatus(403);

        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => Str::random(6),
            'email' => Str::lower(Str::random(10)) . '@test.local',
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password' => bcrypt('password'), 'role' => 'super_admin', 'status' => 'active',
        ]);

        $this->actingAs($superAdmin)->postJson('/api/admin/sensors', ['label' => 'Super ' . Str::random(6), 'device_key' => $this->provisionedKey()])
            ->assertOk();
    }

    /** Device management is Admin/Super Admin only — Farm Owners are refused. */
    public function test_farm_owner_cannot_manage_device_assignments(): void
    {
        $farm   = $this->makeFarm('Farm 1');
        $other  = $this->makeFarm('Farm 2');
        $device = $this->makeDevice($farm);
        $owner  = $farm->user;

        $this->actingAs($owner)->getJson('/api/admin/sensors')->assertStatus(403);
        $this->actingAs($owner)->getJson("/api/admin/farms/{$farm->id}/sensors")->assertStatus(403);
        $this->actingAs($owner)->postJson('/api/admin/sensors', [
            'label' => 'Owner ' . Str::random(6), 'device_key' => $this->provisionedKey(),
        ])->assertStatus(403);
        $this->actingAs($owner)->putJson("/api/admin/sensors/{$device->id}", ['status' => 'Inactive'])->assertStatus(403);
        $this->actingAs($owner)->patchJson("/api/admin/sensors/{$device->id}/assign", ['farm_id' => $other->id])->assertStatus(403);
        $this->actingAs($owner)->patchJson("/api/admin/sensors/{$device->id}/unassign")->assertStatus(403);

        // Nothing moved.
        $this->assertSame($farm->id, $device->fresh()->farm_id);
        $this->assertSame('Active', $device->fresh()->status);
    }

    /** Device management also requires a login — no anonymous access. */
    public function test_device_management_requires_authentication(): void
    {
        $farm   = $this->makeFarm('Farm 1');
        $device = $this->makeDevice($farm);

        $this->getJson('/api/admin/sensors')->assertStatus(401);
        $this->patchJson("/api/admin/sensors/{$device->id}/unassign")->assertStatus(401);
        $this->patchJson("/api/admin/sensors/{$device->id}/assign", ['farm_id' => $farm->id])->assertStatus(401);

        $this->assertSame($farm->id, $device->fresh()->farm_id);
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

        $res = $this->actingAs($admin)->postJson('/api/admin/sensors', [
            'label' => $name, 'installed_at' => now()->toDateString(), 'device_key' => $this->provisionedKey(),
        ]);

        // New devices start Unassigned, so connectivity reads as such.
        $res->assertOk()->assertJsonPath('data.device_name', $name)->assertJsonPath('data.connectivity', 'Unassigned');

        $key = $res->json('data.device_key');

        // Duplicate name rejected.
        $this->actingAs($admin)->postJson('/api/admin/sensors', ['label' => $name, 'device_key' => $this->provisionedKey()])
            ->assertStatus(422);

        $this->actingAs($admin)->patchJson("/api/admin/sensors/{$res->json('data.id')}/assign", ['farm_id' => $farm->id])
            ->assertOk();

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
