<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\SensorCalibrationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Ammonia calibration: the reference-pair path, and keeping the raw count.
 *
 * TWO WAYS TO GET ppm, and the order between them matters.
 *
 *   reference pair   ppm = C_ref * (Rs/Rs_ref)^(1/slope)
 *                    One measured (raw, ppm) pair from a calibrated NH3
 *                    meter. Dividing the power law by itself at that point
 *                    cancels Ro, and with it BOTH constants that have no
 *                    source: clean_air_ratio (3.6, an MQ-135 figure absent
 *                    from every MQ-137 datasheet) and intercept.
 *
 *   clean-air        ppm = 10^((log10(Rs/Ro) - intercept)/slope)
 *                    The fallback. Honest about its own weakness, but it
 *                    still rests on the assumed 3.6.
 *
 * The pair must win when present, and must be per device: AGB-D01 and
 * AGB-D02 read far apart in the same air, so one device's pair applied to
 * the other is worse than no calibration at all.
 *
 * These tests also pin ammonia_raw. Until each device was calibrated, raw
 * was recoverable from the stored value (raw = ammonia * 40.95). It no
 * longer is: ppm now depends on which constants were deployed on the day a
 * row was written, and those have already changed several times. Storing
 * raw is what keeps a future recalibration applicable to history.
 */
class AmmoniaCalibrationTest extends TestCase
{
    use DatabaseTransactions;

    // ---------------------------------------------------------- the raw count

    public function test_ingestion_stores_the_raw_ammonia_count(): void
    {
        $this->requireMysql();
        $device = $this->makeDevice();

        $this->postJson('/api/sensor-readings', $this->payload($device, ['ammonia_raw' => 812]))
            ->assertOk();

        $this->assertSame(
            812,
            (int) SensorReading::where('sensor_id', $device->id)->latest('id')->value('ammonia_raw'),
            'The raw ADC count must be stored exactly as the device reported it.'
        );
    }

    public function test_the_raw_count_is_kept_even_when_ppm_cannot_be_computed(): void
    {
        $this->requireMysql();
        $device = $this->makeDevice();

        // No baseline for this device, so ammonia falls back to the
        // placeholder scale — but the measurement itself is still a fact.
        $this->postJson('/api/sensor-readings', $this->payload($device, ['ammonia_raw' => 377]))
            ->assertOk();

        $this->assertSame(
            377,
            (int) SensorReading::where('sensor_id', $device->id)->latest('id')->value('ammonia_raw')
        );
    }

    // ----------------------------------------------------- the reference pair

    public function test_a_reference_pair_returns_its_own_ppm_at_its_own_raw(): void
    {
        $this->withReferencePair('AGB-REFA', 754, 22.0);

        $this->assertSame(
            22.0,
            app(SensorCalibrationService::class)->ammoniaPpm(754, 'AGB-REFA'),
            'At the reference point the curve must pass exactly through the measured ppm.'
        );
    }

    public function test_a_reference_pair_wins_over_a_clean_air_baseline(): void
    {
        config(['sensors.calibration.per_device' => [
            'AMMONIA_RAW_CLEAN_AIR_AGB_REFB' => 283,
            'AMMONIA_RAW_REF_AGB_REFB' => 754,
            'AMMONIA_PPM_REF_AGB_REFB' => 22.0,
        ]]);

        // With the baseline alone this raw reads 19.8 ppm; the pair anchors
        // the same curve at 22.0, so the pair must be the one in force.
        $this->assertSame(
            22.0,
            app(SensorCalibrationService::class)->ammoniaPpm(754, 'AGB-REFB')
        );
    }

    public function test_the_reference_ppm_is_not_truncated_to_a_whole_number(): void
    {
        $this->withReferencePair('AGB-REFC', 754, 12.3);

        // An int cast anywhere along the way turns 12.3 into 12 — a 2.4%
        // error introduced by the reader, in the one number everything is
        // anchored to.
        $this->assertSame(
            12.3,
            app(SensorCalibrationService::class)->ammoniaPpm(754, 'AGB-REFC')
        );
    }

    public function test_half_a_pair_is_ignored_rather_than_guessed(): void
    {
        config(['sensors.calibration.per_device' => [
            'AMMONIA_RAW_CLEAN_AIR_AGB_REFD' => 283,
            'AMMONIA_RAW_REF_AGB_REFD' => 754,
            // AMMONIA_PPM_REF deliberately missing — a typo, not a calibration.
        ]]);

        $this->assertSame(
            19.8,
            app(SensorCalibrationService::class)->ammoniaPpm(754, 'AGB-REFD'),
            'An incomplete pair must fall back, not invent the missing half.'
        );
    }

    public function test_one_device_pair_does_not_leak_into_another(): void
    {
        config(['sensors.calibration.per_device' => [
            'AMMONIA_RAW_REF_AGB_REFE' => 754,
            'AMMONIA_PPM_REF_AGB_REFE' => 22.0,
            'AMMONIA_RAW_CLEAN_AIR_AGB_REFF' => 332,
        ]]);

        $service = app(SensorCalibrationService::class);

        $this->assertSame(22.0, $service->ammoniaPpm(754, 'AGB-REFE'));
        $this->assertSame(11.54, $service->ammoniaPpm(754, 'AGB-REFF'));
    }

    public function test_without_any_calibration_ppm_is_null_so_the_caller_falls_back(): void
    {
        config(['sensors.calibration.per_device' => []]);

        $this->assertNull(
            app(SensorCalibrationService::class)->ammoniaPpm(754, 'AGB-UNKNOWN'),
            'Null keeps "we do not know yet" visible instead of inventing ppm.'
        );
    }

    // --------------------------------------------------- is this device real ppm

    public function test_calibration_status_is_answered_per_device(): void
    {
        config(['sensors.calibration.per_device' => [
            'AMMONIA_RAW_CLEAN_AIR_AGB_REFG' => 283,
            'AMMONIA_RAW_REF_AGB_REFH' => 754,
            'AMMONIA_PPM_REF_AGB_REFH' => 22.0,
        ]]);

        $service = app(SensorCalibrationService::class);

        $this->assertTrue($service->ammoniaIsCalibrated('AGB-REFG'), 'baseline counts');
        $this->assertTrue($service->ammoniaIsCalibrated('AGB-REFH'), 'a pair counts');
        $this->assertFalse(
            $service->ammoniaIsCalibrated('AGB-REFI'),
            'A device with neither is on the placeholder scale and must not be labelled ppm.'
        );
    }

    // ------------------------------------------------------------------

    private function requireMysql(): void
    {
        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AmmoniaCalibrationTest');
        }

        Http::fake(); // never hit the real SMS gateway on status flips
    }

    private function withReferencePair(string $label, int $raw, float $ppm): void
    {
        $key = strtoupper(preg_replace('/[^A-Za-z0-9]+/', '_', $label));

        config(['sensors.calibration.per_device' => [
            "AMMONIA_RAW_REF_{$key}" => $raw,
            "AMMONIA_PPM_REF_{$key}" => $ppm,
        ]]);
    }

    private function makeDevice(): Sensor
    {
        $n = Str::upper(Str::random(5));

        $owner = User::create([
            'first_name' => 'Test',
            'last_name' => Str::random(6),
            'email' => Str::lower(Str::random(10)).'@test.local',
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password' => bcrypt('password'),
            'role' => 'farm_owner',
            'status' => 'active',
        ]);

        $farm = Farm::create([
            'user_id' => $owner->id,
            'farm_name' => "Ammonia Test {$n}",
            'owner_name' => 'Test Owner',
            'mobile_number' => $owner->mobile_number,
            'barangay' => 'Test',
            'municipality' => 'San Jose',
            'province' => 'Batangas',
            'address' => 'Test',
            'farm_size' => 'Small',
            'status' => 'Active',
        ]);

        return Sensor::create([
            'farm_id' => $farm->id,
            'device_key' => "AGB-A{$n}-".Str::upper(Str::random(5)),
            'label' => "AGB-A{$n}",
            'status' => 'Active',
        ]);
    }

    /**
     * Temperature 22 and humidity 65 sit mid-band so neither drives the
     * status; soil_raw 3072 is a Safe moisture. Only ammonia varies.
     */
    private function payload(Sensor $sensor, array $overrides = []): array
    {
        return array_merge([
            'device_key' => $sensor->device_key,
            'temperature' => 22,
            'humidity' => 65,
            'soil_raw' => 3072,
            'ammonia_raw' => 500,
        ], $overrides);
    }
}
