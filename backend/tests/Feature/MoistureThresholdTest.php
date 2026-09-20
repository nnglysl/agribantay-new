<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\MoistureThresholdService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Manure moisture classification per the IoT Thresholds RRL:
 *
 *   < 25%            Safe
 *   >= 25%, < 35%    Warning
 *   >= 35%           Critical
 *
 * The pure classifier tests need no database. The ingestion tests hit the
 * real MySQL connection like DeviceRotationTest and are rolled back:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=MoistureThresholdTest
 */
class MoistureThresholdTest extends TestCase
{
    use DatabaseTransactions;

    /** Exact boundaries the operational rule must honour. */
    public static function boundaryCases(): array
    {
        return [
            '24.99 -> Safe'     => [24.99, 'Safe'],
            '25.00 -> Warning'  => [25.00, 'Warning'],
            '25.01 -> Warning'  => [25.01, 'Warning'],
            '34.99 -> Warning'  => [34.99, 'Warning'],
            '35.00 -> Critical' => [35.00, 'Critical'],
            '35.01 -> Critical' => [35.01, 'Critical'],
        ];
    }

    /** Representative values inside each band. */
    public static function representativeCases(): array
    {
        return [
            '0 -> Safe'      => [0, 'Safe'],
            '10 -> Safe'     => [10, 'Safe'],
            '24 -> Safe'     => [24, 'Safe'],
            '30 -> Warning'  => [30, 'Warning'],
            '34 -> Warning'  => [34, 'Warning'],
            '35 -> Critical' => [35, 'Critical'],
            '40 -> Critical' => [40, 'Critical'],
            '72 -> Critical' => [72, 'Critical'],
        ];
    }

    /** @dataProvider boundaryCases */
    public function test_boundary_values_classify_exactly(float $moisture, string $expected): void
    {
        $this->assertSame($expected, app(MoistureThresholdService::class)->classify($moisture));
    }

    /** @dataProvider representativeCases */
    public function test_representative_values_classify(float $moisture, string $expected): void
    {
        $this->assertSame($expected, app(MoistureThresholdService::class)->classify($moisture));
    }

    public function test_thresholds_come_from_config(): void
    {
        $this->assertSame(25.0, app(MoistureThresholdService::class)->warning());
        $this->assertSame(35.0, app(MoistureThresholdService::class)->critical());
    }

    /**
     * A value that would ROUND to a boundary must still be classified on
     * its raw value: 24.996 -> Safe even though it displays as 25.00, and
     * 34.996 -> Warning even though it displays as 35.00.
     */
    public function test_classifier_is_not_fooled_by_display_rounding(): void
    {
        $svc = app(MoistureThresholdService::class);

        $this->assertSame('Safe', $svc->classify(24.996));
        $this->assertSame('Warning', $svc->classify(34.996));
        // ...whereas classifying the rounded value would be wrong:
        $this->assertSame('Warning', $svc->classify(round(24.996, 2)));
        $this->assertSame('Critical', $svc->classify(round(34.996, 2)));
    }

    // ------------------------------------------------------------------
    // Ingestion path (real MySQL, rolled back)
    // ------------------------------------------------------------------

    /**
     * soil_raw -> moisture = 100 - raw/4095*100, classified on the raw
     * float, then stored rounded to 2 decimals.
     *
     *   raw 3072 -> 24.9817% (Safe),     stored 24.98
     *   raw 3071 -> 25.0061% (Warning),  stored 25.01
     *   raw 2662 -> 34.9939% (Warning),  stored 34.99
     *   raw 2661 -> 35.0183% (Critical), stored 35.02
     */
    public static function ingestCases(): array
    {
        return [
            'raw 3072 -> Safe'     => [3072, 'Safe',     24.98],
            'raw 3071 -> Warning'  => [3071, 'Warning',  25.01],
            'raw 2662 -> Warning'  => [2662, 'Warning',  34.99],
            'raw 2661 -> Critical' => [2661, 'Critical', 35.02],
            'raw 500 -> Critical'  => [500,  'Critical', 87.79],
        ];
    }

    /** @dataProvider ingestCases */
    public function test_ingested_reading_stores_status_and_rounded_value(int $soilRaw, string $expectedStatus, float $expectedStored): void
    {
        $this->requireMysql();

        $device = $this->makeDevice($this->makeFarm('Moisture Ingest Farm'));

        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => $soilRaw]))
            ->assertOk()
            ->assertJsonPath('data.moisture_status', $expectedStatus);

        $reading = SensorReading::latest('id')->first();
        $this->assertSame($expectedStatus, $reading->moisture_status);
        $this->assertSame($expectedStored, (float) $reading->moisture);
    }

    /** Overall farm status aggregates the moisture label (Critical > Warning > Safe). */
    public function test_farm_status_follows_moisture_severity(): void
    {
        $this->requireMysql();

        $farm   = $this->makeFarm('Moisture Aggregation Farm');
        $device = $this->makeDevice($farm);

        // raw 3072 -> 24.98% Safe on moisture; other fields in the payload are Safe.
        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 3072]))->assertOk();
        $this->assertSame('Safe', $farm->fresh()->current_status);

        // raw 3000 -> 26.74% Warning
        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 3000]))->assertOk();
        $this->assertSame('Warning', $farm->fresh()->current_status);

        // raw 2500 -> 38.95% Critical
        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 2500]))->assertOk();
        $this->assertSame('Critical', $farm->fresh()->current_status);
    }

    // ------------------------------------------------------------------

    private function requireMysql(): void
    {
        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=MoistureThresholdTest');
        }

        Http::fake(); // never hit the real SMS gateway on status flips
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

    private function makeDevice(Farm $farm): Sensor
    {
        $n = Str::upper(Str::random(5));

        return Sensor::create([
            'farm_id'    => $farm->id,
            'device_key' => "AGB-M{$n}-" . Str::upper(Str::random(5)),
            'label'      => "AGB-M{$n}",
            'status'     => 'Active',
        ]);
    }

    /**
     * Ammonia raw 500 -> 12.21 ppm (Safe), temperature 29.4 (Safe under the
     * current 22-32 band), humidity 65 (Safe) — so only moisture drives
     * the per-reading and farm-level status in these tests.
     */
    private function payload(Sensor $sensor, array $overrides = []): array
    {
        return array_merge([
            'device_key'  => $sensor->device_key,
            'temperature' => 29.4,
            'humidity'    => 65,
            'soil_raw'    => 3072,
            'ammonia_raw' => 500,
        ], $overrides);
    }
}
