<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Device connectivity timeout
    |--------------------------------------------------------------------------
    |
    | A device counts as Online while its last accepted reading
    | (sensors.last_seen_at) is younger than this many minutes; otherwise it
    | is Offline. The firmware transmits roughly once every 60 seconds, so
    | 3 minutes tolerates two consecutive missed uploads (LTE hiccups) before
    | the farm is shown as Offline. This is the single source of truth — all
    | controllers/services read it from here.
    |
    */

    'offline_after_minutes' => (int) env('SENSOR_OFFLINE_AFTER_MINUTES', 3),

    /*
    |--------------------------------------------------------------------------
    | Manure moisture classification thresholds (%)
    |--------------------------------------------------------------------------
    |
    | Sources (the 25 / 35 pair, and why those two numbers):
    |
    |   Madri, B., Janssens, G.P.J. & Delezie, E. (2022). "How do moisture
    |   content, friability, and crust development of litter influence
    |   ammonia concentrations in broiler production?" Livestock Science 265,
    |   105109. doi:10.1016/j.livsci.2022.105109
    |
    |   Italian Journal of Animal Science (2025). "A multifactorial way to
    |   assess litter stability and ammonia risk in broiler production:
    |   effects across age (7-39 days) and thermal environments."
    |   doi:10.1080/1828051X.2025.2586295
    |
    |   USDA-ARS, "Poultry Litter Moisture Management to Reduce Ammonia" -
    |   a rise to 30% moisture releases ~1.8x the ammonia of drier litter.
    |
    |   UGA Extension B1267, "Litter Quality and Broiler Performance" -
    |   20-25% is the managed optimum; below 20% the litter turns dusty.
    |
    | 25% is the top of that managed optimum, so crossing it is the first
    | thing worth telling a farmer. 35% sits just under the peak-emission
    | band: ammonia release RISES with moisture only up to roughly 37-51%
    | (temperature-dependent) and then falls again as saturated manure goes
    | anaerobic and the ammonia stays dissolved (Liu et al., "High litter
    | moisture content suppresses litter ammonia volatilization",
    | PMID 21673154). So 35% is the last point at which a farmer can still
    | act before emission peaks - NOT a claim that wetter is always worse.
    |
    | AgriBantay's resulting operational rule:
    |
    |   Safe      < warning               (< 25%)
    |   Warning   >= warning, < critical  (25% - 34.99%)
    |   Critical  >= critical             (>= 35%)
    |
    | Read through App\Services\MoistureThresholdService — every place
    | that labels a moisture value goes through it, so these two numbers
    | are the single source of truth. Only NEW readings are classified
    | with them; historical moisture_status rows are never rewritten.
    |
    */

    'moisture' => [
        'warning'  => 25,
        'critical' => 35,
    ],

    /*
    |--------------------------------------------------------------------------
    | Two-sided environmental thresholds
    |--------------------------------------------------------------------------
    |
    | Temperature and humidity are harmful at BOTH extremes, so each has a
    | low and a high cut point on either side of the safe band:
    |
    |   value <  low_critical                        -> Critical
    |   value <  low_safe                            -> Warning
    |   value <= high_safe                           -> Safe
    |   value <  high_critical                       -> Warning
    |   value >= high_critical                       -> Critical
    |
    | The >= convention on the critical cut matches 'moisture' above, so a
    | value sitting exactly on a boundary is classified the same way for
    | every metric.
    |
    | Numbers come from the IoT Thresholds RRL:
    |
    |   Temperature  Safe 18-24 C     Moderate 13-17 / 25-29   Critical <12 / >30
    |     Source: "Characterization of Ammonia Emissions from Broiler Litter
    |     under Controlled Laboratory Conditions" (ASABE) — manure surface
    |     temperature drives the rate of NH3 release.
    |
    |   Humidity     Safe 50-70%      Moderate 40-49 / 71-79   Critical <30 / >80
    |     Source: "Assessment of Environmental Factors Affecting Ammonia
    |     Emissions in Broiler Houses" (ScienceDirect) — >80% stops wet litter
    |     evaporating, <30% creates excessive airborne dust.
    |
    | The RRL writes its moderate bands in whole numbers (13-17, 25-29). Those
    | are the same cut points expressed as integers; the bands below are the
    | contiguous form of exactly those numbers, with nothing added.
    |
    | Only NEW readings are classified with these values — historical
    | *_status rows are never rewritten, same policy as moisture.
    |
    */

    'temperature' => [
        'low_critical'  => 12,
        'low_safe'      => 18,
        'high_safe'     => 24,
        'high_critical' => 30,
    ],

    'humidity' => [
        'low_critical'  => 30,
        'low_safe'      => 50,
        'high_safe'     => 70,
        'high_critical' => 80,
    ],

    /*
    |--------------------------------------------------------------------------
    | Ammonia — NOT YET CALIBRATED
    |--------------------------------------------------------------------------
    |
    | The RRL sets Safe <15 ppm, Moderate 15-25 ppm, Critical >25 ppm, but the
    | stored 'ammonia' value is NOT ppm yet. SensorIngestController converts
    | the raw MQ-137 ADC reading with a placeholder linear scale
    | ((raw / 4095) * 100), so comparing it against ppm thresholds would be
    | meaningless.
    |
    | Real ppm needs, in order:
    |   1. An MQ-137 that reads above the ESP32 ADC floor (~0.14 V)
    |   2. Ro measured in clean air
    |   3. The a and b constants from the sensor datasheet curve,
    |      applied as ppm = a * (Rs/Ro)^b
    |
    | Until then the existing placeholder classification is left untouched
    | rather than dressed up with research thresholds it cannot honour.
    |
    */

    /*
    |--------------------------------------------------------------------------
    | Which metrics raise alerts
    |--------------------------------------------------------------------------
    |
    | Only the metrics listed here decide a farm's Safe / Warning / Critical
    | level, open alert-history incidents, or trigger SMS. Every other metric
    | is still measured, stored, displayed and fed to the recommendation
    | engine - it is CONTEXT, not an alarm.
    |
    | Ammonia and manure moisture, because both have cut points that hold in
    | this climate:
    |
    |   - Ammonia is the hazard itself, and 15 / 25 ppm is the same figure in
    |     Batangas as in the source literature.
    |
    |   - Manure moisture is what CAUSES it. Urease-producing bacteria need
    |     water to hydrolyse uric acid into ammonia, so dry manure barely
    |     volatilises and wet manure does. That is a property of the manure,
    |     not of the weather outside, so the published bands travel.
    |
    | Temperature and humidity are advisory. Their bands came from
    | temperate-climate studies: a San Jose layer house sits at 32-37 C for
    | most of the day, so a >30 C Critical rule would leave every farm
    | permanently red, and an alert that is always on is not an alert. They
    | are still measured, shown and fed to the recommendations as the context
    | that explains a high ammonia reading.
    |
    | Advisory metrics keep their *_status columns - still computed and
    | stored, so historical rows stay comparable and the reports keep
    | working. They simply no longer decide anything.
    |
    */

    'alerting_metrics' => ['ammonia', 'moisture'],

    /*
    |--------------------------------------------------------------------------
    | Ammonia classification thresholds
    |--------------------------------------------------------------------------
    |
    | TWO scales, because the stored ammonia value means different things
    | depending on whether the device has a clean-air baseline.
    |
    |   ppm          real parts-per-million, once calibration exists. The
    |                IoT Thresholds RRL: Safe <15, Moderate 15-25,
    |                Critical >25 ppm.
    |
    |   placeholder  the uncalibrated (raw / 4095) * 100 scale. These are
    |                NOT ppm and were never research values - they are the
    |                original arbitrary cut points, kept so an uncalibrated
    |                device keeps classifying exactly as it always has.
    |
    | SensorIngestController picks the pair that matches the value it just
    | computed. Without this split, calibrating a device silently moved its
    | Critical cut from 25 ppm up to 35 ppm - a real poultry-house level the
    | RRL calls Critical would have been recorded as Safe.
    |
    */

    'ammonia_ppm' => [
        'warning'  => 15,
        'critical' => 25,
    ],

    'ammonia_placeholder' => [
        'warning'  => 25,
        'critical' => 35,
    ],

    /*
    |--------------------------------------------------------------------------
    | Field calibration
    |--------------------------------------------------------------------------
    |
    | Both sensors report a raw ADC count, and turning that into a real unit
    | needs numbers that can only come from the physical device. Until they
    | are supplied, each conversion stays on its documented placeholder and
    | the UI says so — a plausible-looking wrong number is worse than an
    | openly uncalibrated one, because it gets believed.
    |
    | Set these in .env so calibrating a replacement sensor never needs a
    | code change.
    |
    */
    'calibration' => [

        /*
         | MOISTURE — capacitive soil probe.
         |
         | The placeholder assumes raw 4095 = bone dry and raw 0 = saturated.
         | Neither is true: a capacitive probe in open air reads roughly
         | 2500-3200, so the placeholder reports ~35-40% for a probe sitting
         | on a table — which crosses the Critical cut and has been raising
         | false alerts.
         |
         | Two readings fix it, both taken from the device's own serial
         | output with the sensor already powered and settled:
         |
         |   MOISTURE_RAW_AIR    probe held in open air, completely dry
         |   MOISTURE_RAW_WATER  probe in water up to (not past) its line
         |
         | Then: percent = (air - raw) / (air - water) * 100
         */
        'moisture' => [
            'raw_air'   => env('MOISTURE_RAW_AIR') !== null ? (int) env('MOISTURE_RAW_AIR') : null,
            'raw_water' => env('MOISTURE_RAW_WATER') !== null ? (int) env('MOISTURE_RAW_WATER') : null,
        ],

        /*
         | AMMONIA — MQ-137.
         |
         | ppm = 10 ^ ((log10(Rs/Ro) - intercept) / slope)
         |
         | The load resistor RL cancels out of the Rs/Ro ratio, so it does NOT
         | need to be known — only a clean-air baseline does. That is the one
         | value to supply:
         |
         |   AMMONIA_RAW_CLEAN_AIR   raw ADC in clean outdoor air, after the
         |                           sensor has been powered continuously for
         |                           at least 24h (48h preferred)
         |
         | The remaining constants come from the Hanwei MQ-137 datasheet
         | sensitivity curve and are the same for any module built on that
         | sensor. Recorded here so the source of every number is visible:
         |
         |   clean_air_ratio  3.6     Rs/Ro in fresh air, per the datasheet
         |   slope           -0.263   from curve points (40ppm, 1.0)
         |   intercept        0.42       and (100ppm, 0.8)
         */
        'ammonia' => [
            'raw_clean_air'   => env('AMMONIA_RAW_CLEAN_AIR') !== null ? (int) env('AMMONIA_RAW_CLEAN_AIR') : null,
            'clean_air_ratio' => 3.6,
            'slope'           => -0.263,
            'intercept'       => 0.42,
            'adc_max'         => 4095,
        ],

        /*
         | PER-DEVICE OVERRIDES.
         |
         | Sensors of the same model vary enormously unit to unit, so each
         | device may carry its own calibration:
         |
         |     MOISTURE_RAW_AIR_AGB_D01=1535
         |     MOISTURE_RAW_WATER_AGB_D01=401
         |     AMMONIA_RAW_CLEAN_AIR_AGB_D01=640
         |
         | The suffix is the device label (sensors.label, e.g. "AGB-D01")
         | upper-cased with every non-alphanumeric character turned into an
         | underscore.
         |
         | Collected HERE rather than read with env() at request time on
         | purpose: once php artisan config:cache has run in production,
         | Laravel stops loading .env entirely and every env() call outside a
         | config file returns null. Reading them here bakes them into the
         | cached config, so per-device calibration keeps working live.
         */
        'per_device' => collect($_ENV)
            ->filter(fn ($value, $key) => is_string($key)
                && preg_match('/^(MOISTURE_RAW_AIR|MOISTURE_RAW_WATER|AMMONIA_RAW_CLEAN_AIR)_.+$/', $key)
                && $value !== '' && $value !== null)
            ->map(fn ($value) => (int) $value)
            ->all(),
    ],

];
