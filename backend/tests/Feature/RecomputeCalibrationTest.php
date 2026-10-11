<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * calibration:recompute — the command that makes it worth installing the
 * devices before the reference meter is available.
 *
 * Readings collected in the meantime hold the raw ADC count the sensor
 * actually reported, so once the calibration constants are measured the ppm
 * can be re-derived for the week already behind us. These tests prove that
 * the week is genuinely recoverable, and that the rows which are NOT
 * recoverable are left alone rather than guessed at.
 *
 * Runs against real MySQL for the same reason DeviceRotationTest does:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=RecomputeCalibrationTest
 */
class RecomputeCalibrationTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=RecomputeCalibrationTest');
        }
    }

    private function makeFarm(): Farm
    {
        $owner = User::create([
            'first_name' => 'Recompute',
            'last_name' => Str::random(6),
            'email' => Str::lower(Str::random(10)).'@test.local',
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password' => bcrypt('password'),
            'role' => 'farm_owner',
            'status' => 'active',
        ]);

        return Farm::create([
            'user_id' => $owner->id,
            'farm_name' => 'Recompute Farm '.Str::random(4),
            'owner_name' => 'Test Owner',
            'mobile_number' => $owner->mobile_number,
            'barangay' => 'Test',
            'municipality' => 'San Jose',
            'province' => 'Batangas',
            'address' => 'Test',
            'farm_size' => 'Small',
            'status' => 'Active',
        ]);
    }

    private function makeDevice(Farm $farm, string $label): Sensor
    {
        return Sensor::create([
            'farm_id' => $farm->id,
            'device_key' => "AGB-T{$label}-".Str::upper(Str::random(5)),
            'label' => $label,
            'status' => 'Active',
        ]);
    }

    private function reading(Farm $farm, Sensor $device, array $overrides = []): SensorReading
    {
        return SensorReading::create(array_merge([
            'farm_id' => $farm->id,
            'sensor_id' => $device->id,
            'ammonia' => 1.0,
            'temperature' => 29.0,
            'humidity' => 70.0,
            'moisture' => 20.0,
            'ammonia_status' => 'Safe',
            'temperature_status' => 'Safe',
            'humidity_status' => 'Safe',
            'moisture_status' => 'Safe',
        ], $overrides));
    }

    /** The whole point: a reading taken before calibration is recoverable. */
    public function test_a_reading_with_raw_is_recomputed(): void
    {
        $farm = $this->makeFarm();
        $label = 'RC'.Str::upper(Str::random(4));
        $device = $this->makeDevice($farm, $label);

        // A deliberately wrong stored value, as a pre-calibration row has.
        $reading = $this->reading($farm, $device, [
            'ammonia' => 1.0,
            'ammonia_raw' => 900,
            'ammonia_status' => 'Safe',
        ]);

        // Calibrate this one device, the way .env does on calibration day.
        $envName = strtoupper(str_replace('-', '_', $label));
        config([
            "sensors.calibration.per_device.AMMONIA_RAW_REF_{$envName}" => 900,
            "sensors.calibration.per_device.AMMONIA_PPM_REF_{$envName}" => 12.5,
        ]);

        $this->artisan('calibration:recompute', ['--force' => true])->assertSuccessful();

        $reading->refresh();

        // Anchored exactly on this raw count, the conversion must return the
        // meter's own reading — if it does not, the formula is not being fed
        // the per-device constants at all.
        $this->assertEqualsWithDelta(12.5, (float) $reading->ammonia, 0.05);
    }

    /** A row from before the raw column cannot be recovered, and is not guessed. */
    public function test_a_reading_without_raw_is_left_alone(): void
    {
        $farm = $this->makeFarm();
        $device = $this->makeDevice($farm, 'RC'.Str::upper(Str::random(4)));

        $reading = $this->reading($farm, $device, [
            'ammonia' => 500.0,
            'ammonia_raw' => null,
            'soil_raw' => null,
            'ammonia_status' => 'Critical',
        ]);

        $this->artisan('calibration:recompute', ['--force' => true])->assertSuccessful();

        $reading->refresh();

        $this->assertEquals(500.0, (float) $reading->ammonia, 'A row with no raw was rewritten from nothing.');
        $this->assertSame('Critical', $reading->ammonia_status);
    }

    /** A dry run reports, and writes nothing. */
    public function test_dry_run_writes_nothing(): void
    {
        $farm = $this->makeFarm();
        $label = 'RC'.Str::upper(Str::random(4));
        $device = $this->makeDevice($farm, $label);

        $reading = $this->reading($farm, $device, [
            'ammonia' => 1.0,
            'ammonia_raw' => 900,
        ]);

        $envName = strtoupper(str_replace('-', '_', $label));
        config([
            "sensors.calibration.per_device.AMMONIA_RAW_REF_{$envName}" => 900,
            "sensors.calibration.per_device.AMMONIA_PPM_REF_{$envName}" => 12.5,
        ]);

        $this->artisan('calibration:recompute')->assertSuccessful();

        $reading->refresh();
        $this->assertEquals(1.0, (float) $reading->ammonia, 'A dry run wrote to the table.');
    }

    /**
     * Calibration is per device. The same raw count from two units with
     * different baselines must not produce the same ppm — if it does, a
     * fleet-wide constant is being applied and one of the two is wrong.
     */
    public function test_two_devices_with_different_anchors_diverge(): void
    {
        $farm = $this->makeFarm();
        $labelA = 'RA'.Str::upper(Str::random(4));
        $labelB = 'RB'.Str::upper(Str::random(4));
        $deviceA = $this->makeDevice($farm, $labelA);
        $deviceB = $this->makeDevice($farm, $labelB);

        $readingA = $this->reading($farm, $deviceA, ['ammonia_raw' => 1200]);
        $readingB = $this->reading($farm, $deviceB, ['ammonia_raw' => 1200]);

        $envA = strtoupper(str_replace('-', '_', $labelA));
        $envB = strtoupper(str_replace('-', '_', $labelB));
        config([
            "sensors.calibration.per_device.AMMONIA_RAW_REF_{$envA}" => 900,
            "sensors.calibration.per_device.AMMONIA_PPM_REF_{$envA}" => 12.5,
            "sensors.calibration.per_device.AMMONIA_RAW_REF_{$envB}" => 400,
            "sensors.calibration.per_device.AMMONIA_PPM_REF_{$envB}" => 12.5,
        ]);

        $this->artisan('calibration:recompute', ['--force' => true])->assertSuccessful();

        $readingA->refresh();
        $readingB->refresh();

        $this->assertNotEquals(
            (float) $readingA->ammonia,
            (float) $readingB->ammonia,
            'Both devices returned the same ppm from the same raw count — the per-device anchor is being ignored.'
        );
    }

    /** --device confines the run to one unit, so a deployment can be redone alone. */
    public function test_device_filter_limits_the_run(): void
    {
        $farm = $this->makeFarm();
        $labelA = 'RA'.Str::upper(Str::random(4));
        $labelB = 'RB'.Str::upper(Str::random(4));
        $deviceA = $this->makeDevice($farm, $labelA);
        $deviceB = $this->makeDevice($farm, $labelB);

        $readingA = $this->reading($farm, $deviceA, ['ammonia' => 1.0, 'ammonia_raw' => 900]);
        $readingB = $this->reading($farm, $deviceB, ['ammonia' => 1.0, 'ammonia_raw' => 900]);

        foreach ([$labelA, $labelB] as $label) {
            $env = strtoupper(str_replace('-', '_', $label));
            config([
                "sensors.calibration.per_device.AMMONIA_RAW_REF_{$env}" => 900,
                "sensors.calibration.per_device.AMMONIA_PPM_REF_{$env}" => 12.5,
            ]);
        }

        $this->artisan('calibration:recompute', ['--force' => true, '--device' => $labelA])->assertSuccessful();

        $this->assertEqualsWithDelta(12.5, (float) $readingA->refresh()->ammonia, 0.05);
        $this->assertEquals(1.0, (float) $readingB->refresh()->ammonia, 'The other device was recomputed too.');
    }
}
