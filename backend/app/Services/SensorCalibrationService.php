<?php

namespace App\Services;

/**
 * Turns raw ADC counts into real units, when the field measurements needed
 * to do that honestly are available.
 *
 * Every method here returns null when its calibration is missing, and the
 * caller falls back to the documented placeholder. That is deliberate: a
 * half-calibrated conversion produces numbers that look like ppm or like a
 * moisture percentage, get read as those things, and are wrong. Returning
 * null keeps "we do not know yet" visible all the way to the screen.
 *
 * Calibration values live in config/sensors.php (from .env), so calibrating
 * a replacement sensor is a config change, not a deploy.
 */
class SensorCalibrationService
{
    /**
     * Moisture percentage from a capacitive probe, 0 = bone dry.
     *
     * Two-point linear: the probe's own reading in air is 0% and its reading
     * in water is 100%. Clamped because a reading can legitimately fall
     * slightly outside the calibration pair — a colder day, a probe pushed
     * deeper — and a negative percentage is never a useful answer.
     */
    public function moisturePercent(int $raw, ?string $deviceName = null): ?float
    {
        $air = $this->perDevice('MOISTURE_RAW_AIR', $deviceName)
            ?? config('sensors.calibration.moisture.raw_air');
        $water = $this->perDevice('MOISTURE_RAW_WATER', $deviceName)
            ?? config('sensors.calibration.moisture.raw_water');

        // A capacitive probe reads HIGHER when dry, so air must exceed water.
        // If they are equal or reversed the pair is a mis-measurement, and
        // using it would silently invert every reading.
        if ($air === null || $water === null || $air <= $water) {
            return null;
        }

        $percent = (($air - $raw) / ($air - $water)) * 100;

        return round(max(0, min(100, $percent)), 2);
    }

    /**
     * Ammonia in ppm from an MQ-137 raw ADC count.
     *
     * The load resistor cancels out of the Rs/Ro ratio, so only a clean-air
     * baseline is needed — not RL, which varies between modules and is
     * rarely printed on them.
     *
     *   Rs    ∝ (max - raw) / raw          for any fixed RL
     *   Ro    = Rs(clean air) / 3.6
     *   ppm   = 10 ^ ((log10(Rs/Ro) - intercept) / slope)
     */
    public function ammoniaPpm(int $raw, ?string $deviceName = null): ?float
    {
        $cfg = config('sensors.calibration.ammonia');
        $cleanRaw = $this->perDevice('AMMONIA_RAW_CLEAN_AIR', $deviceName)
            ?? ($cfg['raw_clean_air'] ?? null);

        if ($cleanRaw === null) {
            return null;
        }

        $max = (int) $cfg['adc_max'];

        // A reading at either rail is the ADC saturating, not a measurement:
        // both ends make the resistance ratio divide by zero.
        if ($raw <= 0 || $raw >= $max || $cleanRaw <= 0 || $cleanRaw >= $max) {
            return null;
        }

        // Resistance is proportional to (max - raw) / raw with RL constant;
        // the constant drops out when the two are divided below.
        $rsProportional = ($max - $raw) / $raw;
        $rsCleanProportional = ($max - $cleanRaw) / $cleanRaw;

        $ratio = ((float) $cfg['clean_air_ratio']) * ($rsProportional / $rsCleanProportional);

        if ($ratio <= 0) {
            return null;
        }

        $ppm = 10 ** ((log10($ratio) - (float) $cfg['intercept']) / (float) $cfg['slope']);

        // Beyond the sensor's rated range the datasheet curve is an
        // extrapolation, not a measurement. Clamping keeps a noisy reading
        // from reporting an ammonia level no poultry house could survive.
        if (!is_finite($ppm) || $ppm < 0) {
            return null;
        }

        return round(min($ppm, 500), 2);
    }

    /**
     * A calibration value for ONE named device, or null to fall back to the
     * shared one.
     *
     * MQ-137 sensors vary enormously unit to unit — the two devices on this
     * farm read roughly 2490 and 340 in the same air — so a single clean-air
     * baseline calibrates one correctly and makes the other worse than the
     * placeholder it replaced. Soil probes vary the same way, if less
     * dramatically. Keyed by device name so a replacement unit is a .env
     * line, not a migration:
     *
     *     AMMONIA_RAW_CLEAN_AIR_AGB_D01=2490
     *     MOISTURE_RAW_AIR_AGB_D02=3150
     *
     * Any character that cannot appear in an env key becomes an underscore,
     * so "AGB-D01" reads as AGB_D01.
     */
    private function perDevice(string $prefix, ?string $deviceName): ?int
    {
        if (!$deviceName) {
            return null;
        }

        $suffix = strtoupper(preg_replace('/[^A-Za-z0-9]+/', '_', $deviceName));

        // Read from config, not env(): with a cached config Laravel never
        // loads .env, so env() would silently return null in production and
        // every device would quietly fall back to the placeholder scale.
        $value = config("sensors.calibration.per_device.{$prefix}_{$suffix}");

        return $value === null || $value === '' ? null : (int) $value;
    }

    public function moistureIsCalibrated(): bool
    {
        $air = config('sensors.calibration.moisture.raw_air');
        $water = config('sensors.calibration.moisture.raw_water');

        return $air !== null && $water !== null && $air > $water;
    }

    public function ammoniaIsCalibrated(): bool
    {
        return config('sensors.calibration.ammonia.raw_clean_air') !== null;
    }
}
