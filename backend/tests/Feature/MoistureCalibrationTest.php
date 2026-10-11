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
 * Manure moisture calibration: the polynomial path, and keeping the raw count.
 *
 * THREE WAYS TO GET A MOISTURE NUMBER, and only one of them is a moisture
 * content. The order between them is the whole point of these tests.
 *
 *   polynomial   MC_wb = a*S^2 + b*S + c
 *                Fitted against manure samples weighed wet, dried over a
 *                water bath and reweighed, so it is wet-basis moisture
 *                content — the unit the 25 / 35 thresholds are written in.
 *
 *   two-point    index = (air - S) / (air - water) * 100
 *                A probe index that happens to be scaled 0-100. Layer
 *                manure at 70% MC is not 70% of the way from air to water
 *                in dielectric terms, so this is NOT MC_wb. Fallback only.
 *
 *   placeholder  100 - (S / 4095) * 100, assuming raw 4095 is bone dry.
 *                Wrong for every capacitive probe — they read ~2500-3200 in
 *                open air. Last resort.
 *
 * The fit used throughout is a = 0.00001, b = -0.09, c = 200 over raw
 * 1480-3010, which gives round numbers and the physically correct direction
 * (a capacitive probe reads LOWER as the manure gets wetter):
 *
 *   S = 1480  ->  88.70 %     S = 2800  ->  26.40 %   (Warning)
 *   S = 2000  ->  60.00 %     S = 2900  ->  23.10 %   (Safe)
 *   S = 3010  ->  19.70 %
 *
 * Its vertex sits at S = -b/2a = 4500, well outside 1480-3010, so the curve
 * is monotonic everywhere it is used. Two of the tests below exist because
 * a fit whose vertex lands INSIDE that range would report wetter manure as
 * drier, and because evaluating the curve outside the five samples' span is
 * extrapolation rather than measurement.
 */
class MoistureCalibrationTest extends TestCase
{
    use DatabaseTransactions;

    private const A = 0.00001;

    private const B = -0.09;

    private const C = 200;

    private const RAW_MIN = 1480;

    private const RAW_MAX = 3010;

    // ------------------------------------------------- which path wins

    public function test_the_polynomial_fit_is_preferred_over_the_two_point_index(): void
    {
        // Both configured for the same device. The two-point index at raw
        // 2000 across the same span is (3010-2000)/(3010-1480)*100 = 66.01,
        // so the two answers are far enough apart that a passing assertion
        // can only mean the polynomial was used.
        $this->withPoly('AGB-M01');
        config(['sensors.calibration.moisture.raw_air' => self::RAW_MAX]);
        config(['sensors.calibration.moisture.raw_water' => self::RAW_MIN]);

        $this->assertSame(
            60.0,
            app(SensorCalibrationService::class)->moisturePercent(2000, 'AGB-M01'),
            'A fitted MC_wb curve must win over the air/water probe index.'
        );
    }

    public function test_the_two_point_index_is_still_used_when_no_fit_exists(): void
    {
        config(['sensors.calibration.moisture.raw_air' => self::RAW_MAX]);
        config(['sensors.calibration.moisture.raw_water' => self::RAW_MIN]);

        $this->assertSame(
            66.01,
            app(SensorCalibrationService::class)->moisturePercent(2000, 'AGB-M02'),
            'Without a fit the probe index remains the better of the two fallbacks.'
        );
    }

    public function test_a_fit_belongs_to_one_device_only(): void
    {
        // Capacitive probes vary unit to unit, so one probe's fit applied to
        // another is worse than no calibration at all.
        $this->withPoly('AGB-M03');

        $service = app(SensorCalibrationService::class);

        $this->assertSame(60.0, $service->moisturePercent(2000, 'AGB-M03'));
        $this->assertNull(
            $service->moisturePercent(2000, 'AGB-M04'),
            "A sibling device must not inherit another probe's curve."
        );
    }

    // ------------------------------------------------- the two guards

    public function test_a_fit_that_reverses_inside_the_operating_range_is_rejected(): void
    {
        // a = -0.00001, b = 0.045 turns at S = -b/2a = 2250, i.e. inside
        // 1480-3010. Past that vertex the curve runs the wrong way and
        // wetter manure would be reported as drier, so the whole fit is
        // refused rather than trusted over the half that still points the
        // right way.
        $this->withPoly('AGB-M05', -0.00001, 0.045, 10, self::RAW_MIN, self::RAW_MAX);

        $this->assertNull(
            app(SensorCalibrationService::class)->moisturePercent(2000, 'AGB-M05'),
            'A non-monotonic fit must be rejected outright, not used in half.'
        );
        $this->assertFalse(
            app(SensorCalibrationService::class)->moistureIsCalibrated('AGB-M05'),
            'A rejected fit must not be reported as a calibration either.'
        );
    }

    public function test_readings_outside_the_fitted_span_are_clamped_not_extrapolated(): void
    {
        $this->withPoly('AGB-M06');

        $service = app(SensorCalibrationService::class);

        // Beyond the five samples the curve is an assumption. Both ends are
        // pinned to the nearest measured point instead — the same policy the
        // ammonia path applies at the MQ-137's rated 200 ppm ceiling.
        $this->assertSame(19.7, $service->moisturePercent(3500, 'AGB-M06'), 'past the dry end');
        $this->assertSame(88.7, $service->moisturePercent(900, 'AGB-M06'), 'past the wet end');

        // And the boundaries themselves are the values being clamped to.
        $this->assertSame(19.7, $service->moisturePercent(self::RAW_MAX, 'AGB-M06'));
        $this->assertSame(88.7, $service->moisturePercent(self::RAW_MIN, 'AGB-M06'));
    }

    // ------------------------------------------------- partial / degenerate fits

    public function test_an_incomplete_fit_is_ignored_rather_than_half_applied(): void
    {
        // c missing is a typo in .env. Treating the gap as 0 would deliver a
        // curve nobody measured — here it would read 140% low at every point.
        $key = 'AGB_M07';

        config(['sensors.calibration.per_device' => [
            "MOISTURE_POLY_A_{$key}" => self::A,
            "MOISTURE_POLY_B_{$key}" => self::B,
            "MOISTURE_RAW_MIN_{$key}" => self::RAW_MIN,
            "MOISTURE_RAW_MAX_{$key}" => self::RAW_MAX,
        ]]);

        $this->assertNull(
            app(SensorCalibrationService::class)->moisturePercent(2000, 'AGB-M07'),
            'Four of five numbers is a typo, not a calibration.'
        );
    }

    public function test_a_straight_line_fit_is_accepted(): void
    {
        // a = 0 has no vertex and cannot reverse. It is also what the
        // poultry-manure literature actually used (Mendes, Li et al. 2014
        // regressed linearly against moisture content and bulk density), so
        // refusing it would reject the better-supported model.
        $this->withPoly('AGB-M08', 0, -0.045, 150, self::RAW_MIN, self::RAW_MAX);

        $this->assertSame(
            60.0,
            app(SensorCalibrationService::class)->moisturePercent(2000, 'AGB-M08'),
            'A degree-1 fit is a valid fit, not a disabled one.'
        );
    }

    public function test_the_result_is_held_inside_zero_to_one_hundred(): void
    {
        // A fit can overshoot at the ends of its own domain; a moisture
        // content cannot. b = -0.2, c = 400 overshoots in both directions:
        // 104% at raw 1480 and -202% at raw 3010.
        $this->withPoly('AGB-M09', 0, -0.2, 400, self::RAW_MIN, self::RAW_MAX);

        $service = app(SensorCalibrationService::class);

        $this->assertSame(100.0, $service->moisturePercent(self::RAW_MIN, 'AGB-M09'));
        $this->assertSame(0.0, $service->moisturePercent(self::RAW_MAX, 'AGB-M09'));
    }

    // ------------------------------------------------- what counts as calibrated

    public function test_only_the_polynomial_counts_as_calibrated(): void
    {
        // The distinction the whole fix rests on: the two-point path yields a
        // probe index, so reporting it as calibrated would restate the
        // original mistake — a number that looks like a moisture content, is
        // stored as one, and is not one.
        $this->withPoly('AGB-M10');
        config(['sensors.calibration.moisture.raw_air' => self::RAW_MAX]);
        config(['sensors.calibration.moisture.raw_water' => self::RAW_MIN]);

        $service = app(SensorCalibrationService::class);

        $this->assertTrue($service->moistureIsCalibrated('AGB-M10'), 'a usable fit counts');
        $this->assertFalse(
            $service->moistureIsCalibrated('AGB-M11'),
            'An air/water pair is not a moisture calibration, however well measured.'
        );
    }

    // ------------------------------------------------- ingestion

    public function test_ingestion_stores_the_raw_soil_count(): void
    {
        $this->requireMysql();
        $device = $this->makeDevice();

        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 2731]))
            ->assertOk();

        $this->assertSame(
            2731,
            (int) SensorReading::where('sensor_id', $device->id)->latest('id')->value('soil_raw'),
            'The raw ADC count must be stored exactly as the probe reported it, so a later recalibration can be applied to history.'
        );
    }

    public function test_a_faulty_probe_still_records_its_raw_zero(): void
    {
        $this->requireMysql();
        $device = $this->makeDevice();

        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 0]))
            ->assertOk();

        $row = SensorReading::where('sensor_id', $device->id)->latest('id')->first();

        // raw 0 is a hardware fault, not a saturated probe: moisture stays
        // unknown, but the 0 is kept so "the probe reported nothing" remains
        // distinguishable from a row written before the column existed.
        $this->assertNull($row->moisture, 'A faulty probe must not fabricate a moisture value.');
        $this->assertSame(0, (int) $row->soil_raw);
    }

    public function test_ingestion_classifies_on_the_fitted_moisture(): void
    {
        $this->requireMysql();
        $device = $this->makeDevice();
        $this->withPoly($device->device_name);

        // raw 2800 fits to 26.40% MC — Warning (>= 25, < 35). The
        // placeholder would have made it 100 - (2800/4095)*100 = 31.62%,
        // also Warning by luck, so raw 2900 is checked too: 23.10% is Safe
        // on the fit but 29.18% is Warning on the placeholder.
        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 2800]))
            ->assertOk();

        $warning = SensorReading::where('sensor_id', $device->id)->latest('id')->first();
        $this->assertSame(26.4, (float) $warning->moisture);
        $this->assertSame('Warning', $warning->moisture_status);

        $this->postJson('/api/sensor-readings', $this->payload($device, ['soil_raw' => 2900]))
            ->assertOk();

        $safe = SensorReading::where('sensor_id', $device->id)->latest('id')->first();
        $this->assertSame(23.1, (float) $safe->moisture);
        $this->assertSame(
            'Safe',
            $safe->moisture_status,
            'The status must follow the fitted MC_wb, not the placeholder scale that would have called this Warning.'
        );
    }

    // ------------------------------------------------------------------

    private function requireMysql(): void
    {
        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=MoistureCalibrationTest');
        }

        Http::fake(); // never hit the real SMS gateway on status flips
    }

    /**
     * Register a fit against one device label, defaulting to the curve
     * documented in this class's header.
     */
    private function withPoly(
        string $label,
        float $a = self::A,
        float $b = self::B,
        float $c = self::C,
        int $min = self::RAW_MIN,
        int $max = self::RAW_MAX,
    ): void {
        $key = strtoupper(preg_replace('/[^A-Za-z0-9]+/', '_', $label));

        config(['sensors.calibration.per_device' => [
            "MOISTURE_POLY_A_{$key}" => $a,
            "MOISTURE_POLY_B_{$key}" => $b,
            "MOISTURE_POLY_C_{$key}" => $c,
            "MOISTURE_RAW_MIN_{$key}" => $min,
            "MOISTURE_RAW_MAX_{$key}" => $max,
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
            'farm_name' => "Moisture Test {$n}",
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
            'device_key' => "AGB-M{$n}-".Str::upper(Str::random(5)),
            'label' => "AGB-M{$n}",
            'status' => 'Active',
        ]);
    }

    /**
     * Temperature 22 and humidity 65 sit mid-band so neither drives the
     * status; ammonia_raw 500 is low. Only soil_raw varies.
     */
    private function payload(Sensor $sensor, array $overrides = []): array
    {
        return array_merge([
            'device_key' => $sensor->device_key,
            'temperature' => 22,
            'humidity' => 65,
            'soil_raw' => 2900,
            'ammonia_raw' => 500,
        ], $overrides);
    }
}
