<?php

namespace App\Services;

/**
 * Converts raw ADC counts using configured models.
 *
 * Missing configuration returns null so callers can use their legacy fallback.
 * A non-null result is NOT evidence of physical accuracy. In particular, the
 * current ammonia coefficients and voltage mapping remain unvalidated; see
 * config/sensors.php. Presence/status flags are not validation certificates.
 *
 * Calibration values live in config/sensors.php (from .env), so calibrating
 * a replacement sensor is a config change, not a deploy.
 */
class SensorCalibrationService
{
    /**
     * Manure moisture from a capacitive probe's raw ADC count.
     *
     * TWO paths, and they do not return the same kind of number.
     *
     *   polynomial   MC_wb % — wet-basis moisture content, the unit the
     *                25 / 35 thresholds are written in. Fitted against
     *                manure samples that were weighed, dried and reweighed.
     *
     *   two-point    a probe index on a 0-100 scale. NOT moisture content:
     *                it only says where this reading sits between the
     *                probe's own air and water readings. Kept as a fallback
     *                because it is still better than the placeholder, but
     *                classifying it against the thresholds is a known
     *                compromise, not a measurement.
     *
     * The polynomial wins whenever it is configured. See
     * config/sensors.php ('calibration.moisture') for how its five numbers
     * are measured, the accuracy to claim for them (+/- 6.7% MC, Mendes et
     * al. 2014 on laying-hen manure), and why the fit lives here rather
     * than in the ESP32 sketch.
     */
    public function moisturePercent(int $raw, ?string $deviceName = null): ?float
    {
        $fromPoly = $this->polynomialMoisture($raw, $deviceName);

        if ($fromPoly !== null) {
            return $fromPoly;
        }

        return $this->twoPointMoistureIndex($raw, $deviceName);
    }

    /**
     * MC_wb % from the 2nd-degree fit, or null when it is absent or unusable.
     *
     *     MC_wb = a * S^2 + b * S + c
     *
     * S is clamped into the fitted domain first, because outside the five
     * calibration samples the curve is an extrapolation rather than a
     * measurement — the same policy clampPpm() applies at the MQ-137's
     * rated 200 ppm ceiling.
     */
    private function polynomialMoisture(int $raw, ?string $deviceName): ?float
    {
        $fit = $this->resolvePoly($deviceName);

        if ($fit === null) {
            return null;
        }

        [$a, $b, $c, $min, $max] = $fit;

        $s = max($min, min($max, $raw));
        $mc = ($a * $s * $s) + ($b * $s) + $c;

        if (! is_finite($mc)) {
            return null;
        }

        // A fit can still land slightly outside 0-100 at the ends of its own
        // domain; moisture content cannot.
        return round(max(0, min(100, $mc)), 2);
    }

    /**
     * This device's usable fit as [a, b, c, raw_min, raw_max], or null.
     *
     * Every reason a fit is unusable is checked here, in one place, so that
     * moistureIsCalibrated() cannot answer "yes" for a fit that
     * polynomialMoisture() would then refuse to use.
     */
    private function resolvePoly(?string $deviceName): ?array
    {
        $cfg = config('sensors.calibration.moisture.poly', []);

        $a = $this->perDeviceFloat('MOISTURE_POLY_A', $deviceName) ?? ($cfg['a'] ?? null);
        $b = $this->perDeviceFloat('MOISTURE_POLY_B', $deviceName) ?? ($cfg['b'] ?? null);
        $c = $this->perDeviceFloat('MOISTURE_POLY_C', $deviceName) ?? ($cfg['c'] ?? null);
        $min = $this->perDevice('MOISTURE_RAW_MIN', $deviceName) ?? ($cfg['raw_min'] ?? null);
        $max = $this->perDevice('MOISTURE_RAW_MAX', $deviceName) ?? ($cfg['raw_max'] ?? null);

        // All five or none. A fit missing one coefficient is a typo in .env,
        // and defaulting the gap to 0 would quietly deliver a different
        // curve from the one that was measured. Missing bounds are just as
        // disqualifying: without them there is nothing to stop the curve
        // being evaluated where it was never fitted, or to detect the
        // reversal case below.
        if ($a === null || $b === null || $c === null || $min === null || $max === null) {
            return null;
        }

        $a = (float) $a;
        $b = (float) $b;
        $c = (float) $c;
        $min = (int) $min;
        $max = (int) $max;

        if ($min >= $max) {
            return null;
        }

        // REVERSAL GUARD. A parabola turns at S = -b / 2a, and past that
        // vertex moisture moves the wrong way — wetter manure reporting
        // drier. If the turning point falls inside the operating range the
        // fit is not monotonic where it is used, so the whole polynomial is
        // rejected rather than half-trusted. a === 0.0 is a straight-line
        // fit, which has no vertex and is always fine.
        if ($a !== 0.0) {
            $vertex = -$b / (2 * $a);

            if ($vertex > $min && $vertex < $max) {
                return null;
            }
        }

        return [$a, $b, $c, $min, $max];
    }

    /**
     * The fallback probe index: 0 at this probe's air reading, 100 at its
     * water reading. Clamped because a reading can legitimately fall just
     * outside the pair — a colder day, a probe pushed deeper — and a
     * negative percentage is never a useful answer.
     *
     * Read config/sensors.php before quoting this number as a moisture
     * content. It is not one.
     */
    private function twoPointMoistureIndex(int $raw, ?string $deviceName): ?float
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
     * Legacy ammonia estimate from an MQ-137 raw ADC count.
     *
     * For a fixed measuring circuit, RL cancels out of the resistance ratio.
     * This does not validate the slope, reference gas value or voltage mapping.
     *
     *   V     = raw * adc_vref / adc_max       raw counts back to volts
     *   Rs    ∝ (supply_volts - V) / V         for any fixed RL
     *   Ro    = Rs(clean air) / clean_air_ratio
     *   ppm   = 10 ^ ((log10(Rs/Ro) - intercept) / slope)
     *
     * The current raw-to-voltage mapping is an unverified linear approximation.
     * ADC_11db does not imply raw * 3.3 / 4095 is calibrated voltage. The reported
     * single 10k series resistor also provides no fixed voltage-divider ratio.
     *
     * See config/sensors.php for the provenance of every constant used
     * here. Current outputs are not validated ppm measurements; arithmetic is
     * retained for compatibility until hardware and a replacement model are checked.
     */
    public function ammoniaPpm(int $raw, ?string $deviceName = null): ?float
    {
        $cfg = config('sensors.calibration.ammonia');

        $rs = $this->mq137Rs($raw, $cfg);

        if ($rs === null) {
            return null;
        }

        // PREFERRED: a measured reference pair. See referencePairPpm().
        $fromReference = $this->referencePairPpm($rs, $cfg, $deviceName);

        if ($fromReference !== null) {
            return $fromReference;
        }

        // FALLBACK: clean-air baseline plus the ASSUMED clean_air_ratio.
        $cleanRaw = $this->perDevice('AMMONIA_RAW_CLEAN_AIR', $deviceName)
            ?? ($cfg['raw_clean_air'] ?? null);

        if ($cleanRaw === null) {
            return null;
        }

        $rsClean = $this->mq137Rs((int) $cleanRaw, $cfg);

        if ($rsClean === null || $rsClean <= 0) {
            return null;
        }

        $ratio = ((float) $cfg['clean_air_ratio']) * ($rs / $rsClean);

        if ($ratio <= 0) {
            return null;
        }

        return $this->clampPpm(
            10 ** ((log10($ratio) - (float) $cfg['intercept']) / (float) $cfg['slope']),
            $cfg
        );
    }

    /**
     * ppm from ONE measured (raw, ppm) pair, or null when none is configured.
     *
     *     ppm = C_ref * (Rs / Rs_ref) ^ (1 / slope)
     *
     * This is the same power law as the fallback above, divided by itself at
     * the reference point. Doing so cancels Ro — and with it BOTH unsourced
     * constants, clean_air_ratio and intercept. It does NOT establish slope.
     * The old -0.311 derivation misread the supplied Hanwei specification:
     * alpha(20/10) <= 0.65 is a bound, not an exact power-law coefficient.
     * Passing through one anchor is an algebraic property, not an accuracy test.
     *
     * To supply a pair, take one simultaneous reading of this device's raw
     * count and a calibrated NH3 meter's ppm, in the poultry house, then:
     *
     *     AMMONIA_RAW_REF_AGB_D01=614
     *     AMMONIA_PPM_REF_AGB_D01=12.3
     *
     * Both are per device: two MQ-137s of the same model differ enough that
     * one device's pair makes the other worse, not better. With neither set,
     * this returns null and nothing about the existing behaviour changes.
     */
    private function referencePairPpm(float $rs, array $cfg, ?string $deviceName): ?float
    {
        $refRaw = $this->perDevice('AMMONIA_RAW_REF', $deviceName)
            ?? ($cfg['raw_ref'] ?? null);
        $refPpm = $this->perDeviceFloat('AMMONIA_PPM_REF', $deviceName)
            ?? ($cfg['ppm_ref'] ?? null);

        // A pair is only a pair when both halves are present. Half a pair is
        // a typo, not a calibration, so fall through rather than guess.
        if ($refRaw === null || $refPpm === null || (float) $refPpm <= 0) {
            return null;
        }

        $rsRef = $this->mq137Rs((int) $refRaw, $cfg);

        if ($rsRef === null || $rsRef <= 0) {
            return null;
        }

        return $this->clampPpm(
            ((float) $refPpm) * (($rs / $rsRef) ** (1 / (float) $cfg['slope'])),
            $cfg
        );
    }

    /**
     * Sensor resistance from a raw ADC count, proportional to the true Rs.
     *
     * RL is a constant factor here and cancels wherever two of these divide,
     * which is the only way this value is ever used.
     */
    private function mq137Rs(int $raw, array $cfg): ?float
    {
        $max = (int) $cfg['adc_max'];

        // A reading at either rail is the ADC saturating, not a measurement:
        // 0 makes the resistance ratio divide by zero, and adc_max means the
        // divider output has run past what the ADC can see.
        if ($raw <= 0 || $raw >= $max) {
            return null;
        }

        $supply = (float) $cfg['supply_volts'];
        $volts = $raw * ((float) $cfg['adc_vref']) / $max;

        if ($volts <= 0 || $volts >= $supply) {
            return null;
        }

        return ($supply - $volts) / $volts;
    }

    /**
     * Legacy display ceiling. Clamping does not validate the result or establish
     * a safe environment. Values below the published 5 ppm limit are also outside
     * the supplied Hanwei datasheet's scope; this function does not censor them.
     */
    private function clampPpm(float $ppm, array $cfg): ?float
    {
        if (! is_finite($ppm) || $ppm < 0) {
            return null;
        }

        return round(min($ppm, (float) $cfg['max_ppm']), 2);
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
        $value = $this->perDeviceValue($prefix, $deviceName);

        return $value === null ? null : (int) $value;
    }

    /**
     * The same lookup for a value that is NOT a whole ADC count.
     *
     * AMMONIA_PPM_REF is a meter reading such as 12.3, and casting that to
     * int would silently drop it to 12 — a 2.5% error introduced by the
     * reader, in the one number the whole calibration is anchored to.
     */
    private function perDeviceFloat(string $prefix, ?string $deviceName): ?float
    {
        $value = $this->perDeviceValue($prefix, $deviceName);

        return $value === null ? null : (float) $value;
    }

    /**
     * The shared lookup behind both, returning the value as configured.
     */
    private function perDeviceValue(string $prefix, ?string $deviceName): mixed
    {
        if (! $deviceName) {
            return null;
        }

        $suffix = strtoupper(preg_replace('/[^A-Za-z0-9]+/', '_', $deviceName));

        // Read from config, not env(): with a cached config Laravel never
        // loads .env, so env() would silently return null in production and
        // every device would quietly fall back to the placeholder scale.
        $value = config("sensors.calibration.per_device.{$prefix}_{$suffix}");

        return $value === null || $value === '' ? null : $value;
    }

    /**
     * Whether this device's stored `moisture` is real wet-basis moisture
     * content, and may therefore be compared against the 25 / 35 thresholds
     * and labelled a percentage of moisture.
     *
     * ONLY the polynomial fit counts. The two-point air/water path produces
     * a probe index on a 0-100 scale, not MC_wb, so answering "yes" for it
     * would be the original mistake restated: a number that looks like a
     * moisture content, is stored as one, and is not one.
     *
     * Pass the device name. Probes are calibrated individually, so a
     * fleet-wide answer is wrong for every device but the one that happens
     * to match the unsuffixed fallback — the same bug that was fixed on
     * ammoniaIsCalibrated(). Omitting the name answers for the shared
     * config alone, which is almost never what a caller means.
     */
    public function moistureIsCalibrated(?string $deviceName = null): bool
    {
        return $this->resolvePoly($deviceName) !== null;
    }

    /**
     * Legacy check for configured ammonia reference values, not a test of
     * measurement accuracy, slope validity or hardware calibration.
     *
     * Pass the device name. Calibration is per device — AGB-D02 has had a
     * baseline since 27 Sep 2026 and AGB-D01 only since 5 Oct 2026, so a
     * fleet-wide answer was wrong for one of them for eight days, and the
     * UI labelled a placeholder number "ppm" for the whole of it. Omitting
     * the name answers for the shared config alone, which is almost always
     * not what a caller means.
     */
    public function ammoniaIsCalibrated(?string $deviceName = null): bool
    {
        $hasReferencePair = ($this->perDevice('AMMONIA_RAW_REF', $deviceName)
                ?? config('sensors.calibration.ammonia.raw_ref')) !== null
            && ($this->perDeviceFloat('AMMONIA_PPM_REF', $deviceName)
                ?? config('sensors.calibration.ammonia.ppm_ref')) !== null;

        $hasCleanAirBaseline = ($this->perDevice('AMMONIA_RAW_CLEAN_AIR', $deviceName)
            ?? config('sensors.calibration.ammonia.raw_clean_air')) !== null;

        return $hasReferencePair || $hasCleanAirBaseline;
    }
}
