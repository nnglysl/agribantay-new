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
    | THE UNIT MATTERS. Every source above measures litter moisture
    | gravimetrically — wet-basis moisture content, MC_wb = (wet - dry) /
    | wet * 100 — so 25 and 35 are only meaningful against a value in that
    | same unit. That is what 'calibration.moisture.poly' below delivers,
    | and it is why the two-point air/water conversion was demoted to a
    | fallback: it produced a probe index on a 0-100 scale, which these
    | cut points cannot legitimately be applied to.
    |
    | Read through App\Services\MoistureThresholdService — every place
    | that labels a moisture value goes through it, so these two numbers
    | are the single source of truth. Only NEW readings are classified
    | with them; historical moisture_status rows are never rewritten.
    |
    */

    'moisture' => [
        'warning' => 25,
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
        'low_critical' => 12,
        'low_safe' => 18,
        'high_safe' => 24,
        'high_critical' => 30,
    ],

    'humidity' => [
        'low_critical' => 30,
        'low_safe' => 50,
        'high_safe' => 70,
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
    |   ppm          real parts-per-million, once calibration exists.
    |
    |   placeholder  the uncalibrated (raw / 4095) * 100 scale. These are
    |                NOT ppm and were never research values - they are the
    |                original arbitrary cut points, kept so an uncalibrated
    |                device keeps classifying exactly as it always has.
    |
    | SensorIngestController picks the pair that matches the value it just
    | computed. Without this split, calibrating a device silently moved its
    | Critical cut upward - a real poultry-house level that counts as
    | Critical would have been recorded as Safe.
    |
    | WHY CRITICAL IS 20 ppm AND NOT 25
    |
    | The literature's damage threshold is 25 ppm, but AgriBantay is built
    | for the LGU of San Jose, Batangas, and the binding number in the
    | Philippines is lower:
    |
    |   DA Administrative Order No. 12, s. 2002, "Code of Practice and
    |   Minimum Standards for the Welfare of Chickens" (1 April 2002):
    |   "ammonia levels in the poultry houses shall not exceed 20 ppm at
    |   the bird level."
    |   https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/43526
    |
    | A farm sitting at 22 ppm is already in breach of that order. Keeping
    | Critical at 25 would have shown it as merely Warning, so the alert
    | that reaches an inspector would have understated a regulatory
    | violation. The regulator's line wins over the literature's.
    |
    | 25 ppm is still the level at which documented harm begins and stays
    | in the write-up as context - it is simply no longer the cut point:
    |
    |   Okubanjo, Okakwu, Alao, Lawal, Babalola & Olayiwola (2025).
    |   "Sustainable poultry farming: A concept of IoT-based poultry
    |   management system for small-scale farmers." Al-Bahir Journal
    |   (BJEPS) 6(2), Table 3: <10 ppm optimal, 10-25 threshold,
    |   >25 high (respiratory distress, reduced growth), >50 critical.
    |   https://bjeps.alkafeel.edu.iq/journal/vol6/iss2/3/
    |
    | Warning stays at 15 ppm: inside Okubanjo's 10-25 "threshold" band,
    | and far enough below the 20 ppm legal cut to give a farmer time to
    | ventilate before the farm is in breach.
    |
    */

    'ammonia_ppm' => [
        'warning' => 15,
        'critical' => 20,
    ],

    'ammonia_placeholder' => [
        'warning' => 25,
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
         | MOISTURE — capacitive probe in layer manure.
         |
         | THREE paths, tried in this order by SensorCalibrationService.
         | They are NOT interchangeable. Only the first produces gravimetric
         | moisture content, which is the unit the 25 / 35 thresholds at the
         | top of this file are written in:
         |
         |   1. POLYNOMIAL  ('poly')        real MC_wb %, fitted against
         |                                  hand-dried manure samples.
         |   2. TWO-POINT   ('raw_air' /    a RELATIVE dielectric index that
         |                  'raw_water')    happens to be scaled 0-100.
         |                                  NOT moisture content.
         |   3. PLACEHOLDER                 100 - (raw / 4095) * 100.
         |
         | WHY TWO-POINT IS NOT ENOUGH — it was path 1 until now
         |
         | Air/water calibration asserts that the probe's reading in air is
         | 0% and its reading in water is 100%, then reads everything between
         | off a straight line. That defines a PROBE INDEX, not a moisture
         | content. Layer manure at 70% MC is not 70% of the way from air to
         | water in dielectric terms: the permittivity the probe actually
         | measures depends on the solids and on how tightly the manure is
         | packed, not on water alone. The resulting number looked like a
         | percentage, was stored in a column called `moisture`, and was then
         | compared against 25 / 35 — thresholds taken from litter studies
         | that measured MC_wb by drying and weighing. The two were never in
         | the same unit, so that comparison was never valid.
         |
         | The polynomial path is fitted against hand-measured MC_wb, so the
         | stored value and the thresholds finally mean the same thing. The
         | two-point entries below are kept only as the better of the two
         | remaining fallbacks, and are no longer called a calibration.
         */
        'moisture' => [

            /*
             | THE REAL CALIBRATION.
             |
             |     MC_wb (%) = a * S^2 + b * S + c        S = raw ADC count
             |
             | THE CALIBRATION MEDIUM MUST BE THE DEPLOYMENT MEDIUM
             |
             | Read this before anything else here. The fit maps raw counts to
             | moisture content FOR ONE MATERIAL. A capacitive probe measures
             | bulk dielectric permittivity, which depends on the solid matrix
             | as much as on the water in it, so a curve fitted in one medium
             | is simply the wrong curve in another.
             |
             | Concretely: do NOT pad the samples with soil, sand or sawdust to
             | make up volume. Mineral soil runs 1.2-1.6 g/cm^3 against layer
             | manure's 0.4-0.6, so bulk density — the second predictor in
             | Mendes et al. below, not noise — changes by a factor of two or
             | three. Manure is also far more conductive (ammonium, potassium
             | salts, uric acid breakdown); a capacitive probe resists EC
             | better than a resistive one but is not immune. The drying test
             | still returns the true MC_wb OF THE BLEND, which is exactly
             | what makes this dangerous: the y-values look impeccable while
             | the medium they describe is not the one the probe will sit in.
             | The resulting error is systematic and does not average out.
             |
             | The volume needed is small enough that padding is never worth
             | it — see the mass-balance method, which needs about 500 mL in
             | total.
             |
             | HOW THE FIVE NUMBERS ARE OBTAINED
             |
             | Two routes to the same (S, MC_wb) pairs. Both end at step F.
             |
             | ROUTE 1 — MASS BALANCE, ONE CONTAINER (preferred)
             |
             | One container, wetted progressively, weighed at each step. Needs
             | ~500 mL of manure and ONE drying run instead of five, because
             | adding water does not change the dry solids: measure the dry
             | mass once and it stays valid for every later point.
             |
             | This is not a different formula. MC_wb has one definition —
             | water over total wet mass — and both routes compute it:
             |
             |     per-sample drying   MC = (M_wet - M_dry) / M_wet * 100
             |     mass balance        MC = (M     - D    ) / M     * 100
             |
             | M_wet is M and M_dry is D. Identical. The only difference is
             | that D is carried forward rather than re-measured.
             |
             |  A. Weigh the empty container -> T. Use PLASTIC: aluminium or
             |     tin destroys the capacitive field and every S with it. A
             |     llanera is for drying, never for reading.
             |
             |  B. Air-dry the manure thin for 1-2 days until it is crumbly.
             |     The target is simply DRY ENOUGH that the fitted range will
             |     bracket the 25 and 35 cut points — a start above 25% MC
             |     leaves both thresholds outside raw_min..raw_max, where
             |     clamping pins every reading to the range edge and the
             |     calibration is useless. A field rule, since fresh layer
             |     manure runs ~75% MC: dry until the mass is about ONE THIRD
             |     of the fresh mass, which lands near 20%.
             |
             |     Then fill the container, weigh -> G1, net M1 = G1 - T.
             |
             |  C. Mix, pack to a CONSISTENT firmness, bury the probe fully
             |     with no air gaps, let the reading settle (~2 min), record S
             |     for EVERY device in turn — one probe at a time, never two
             |     at once, since two oscillator-based probes placed close
             |     together couple and corrupt both readings. Wipe each probe
             |     and scrape whatever manure clings to it back INTO the
             |     container. Weigh the container at the moment of reading
             |     -> M, and record it on the same line as S.
             |
             |     LEAK CHECK: M should sit slightly below the previous
             |     point's M (evaporation). A larger drop means material was
             |     lost; note it, because it biases the result.
             |
             |  D. Add a little water (~8% of M1 early on, more later), mix
             |     through, cover, wait 10-15 minutes to equilibrate, and
             |     repeat C. Dry to wet ONLY — water is easy to add and almost
             |     impossible to take back out. Since nothing is removed per
             |     point, 7-8 points cost almost nothing; take them (see the
             |     degrees-of-freedom limit below).
             |
             |  E. Get D by drying. Two places to do it, and WHICH ONE DEPENDS
             |     ON HOW MUCH MANURE YOU HAVE:
             |
             |     E1. END-ANCHORED (preferred when material is scarce).
             |         After the last point, transfer the ENTIRE contents to
             |         the llanera — scrape the container out, leave nothing —
             |         and dry to constant mass. That is D. Then fill in every
             |         MC_wb afterwards from the M column.
             |
             |         Nothing is consumed during the run, and D is measured
             |         on the whole sample rather than on a 25 g slice, which
             |         removes subsample-representativeness error entirely.
             |         With ~500 mL of manure this is the only workable form:
             |         two 27 g subsamples out of a ~122 g dried batch is 44%
             |         of the material.
             |
             |         THE COST: D is measured at the END, so any material
             |         lost along the way is missing from it, and the EARLIER
             |         points read too wet. Losing 2 g per reading over 8
             |         readings is 16 g — on ~100 g of dry solids that is
             |         ~7 percentage points at the dry end, worse than the
             |         water-bath bias. Step C's scrape-back and leak check
             |         are what hold this together; they are not optional
             |         here.
             |
             |     E2. START-ANCHORED (when manure is plentiful).
             |         Before step C, take TWO 25-30 g subsamples and average
             |         them. Weigh wet -> s, dry to constant mass -> d. Then:
             |
             |             MC1 = (s - d) / s * 100
             |             dry fraction f = d / s
             |             D = (M1 - s) * f
             |
             |         Costs ~55 g of material but gives MC live during the
             |         run, so water can be added to hit chosen MC targets:
             |
             |             M_target = D / (1 - MC_target / 100)
             |
             |         Add water until the scale reads M_target and the point
             |         lands exactly where you wanted it, instead of wherever
             |         it happens to fall.
             |
             |     EITHER WAY, VERIFY. Under E2, dry the whole remainder at
             |     the end and compare against the carried-forward D. Under E1
             |     the final drying IS D, so the check is the leak column
             |     instead: a run with no unexplained mass drops is the
             |     evidence. This is what turns "D is constant" from an
             |     assumption into a result measured in your own data, and it
             |     is the answer to give when a panel asks.
             |
             | ROUTE 2 — FIVE SEPARATE CONTAINERS (no suitable scale)
             |
             | Needs a scale only for the subsamples, but roughly twice the
             | manure and five drying runs. Split fresh layer manure into 5
             | containers spanning ~20% to 75% MC, mix each through, then per
             | container: do step C for S, take one 30-50 g subsample, and dry
             | it as in step E2 for its own M_dry. Keep each container narrow
             | but leave >= 2 cm of manure around the sensing element, or the
             | wall enters the measurement.
             |
             |  F. Fit the (S, MC_wb) pairs with a 2nd-degree polynomial —
             |     Desmos `y1 ~ a*x1^2 + b*x1 + c`, or a Google Sheets scatter
             |     chart with a Polynomial (Degree 2) trendline set to show
             |     the equation. Record a, b, c AND the lowest/highest S the
             |     samples covered.
             |
             | WHICH ROUTE IS MORE ACCURATE: neither, materially. Route 1
             | concentrates the gravimetric error into one measurement instead
             | of spreading it over five, but propagation DAMPS it rather than
             | amplifying it —
             |
             |     dMC ~ (D/M) * (dd/d) * 100
             |
             | so a 1% error in the dry mass moves MC by 0.7 points at 30% MC
             | and 0.3 points at 70%. Weighing to +/- 1 g on a 240 g container
             | contributes 0.3 points. Both are an order of magnitude below the
             | probe's own +/- 6.7% MC, so the choice of route is not where the
             | accuracy of this calibration is decided. Packing consistency and
             | medium match are (see the limits below, in rank order).
             |
             | THE SIGN OF b IS NOT ASSUMED. A capacitive probe normally
             | reads LOWER as the manure gets wetter, so b usually comes out
             | negative. Whatever direction the fit produces is used as-is —
             | the service only requires that the curve does not reverse
             | inside raw_min..raw_max (see below).
             |
             | WHY THE FIT LIVES HERE AND NOT IN THE FIRMWARE
             |
             | The published procedure puts a, b, c in the ESP32 sketch. This
             | system deliberately does not: the device uploads `soil_raw` and
             | the server converts it. Same arithmetic, but a recalibration is
             | then a .env line instead of a trip to the farm with a laptop to
             | reflash a unit mounted in a poultry house — and because the raw
             | count is stored beside the result, a corrected fit can be
             | applied to readings ALREADY recorded. A coefficient baked into
             | firmware can only ever fix the future.
             |
             | HONEST LIMITS — say these at the defense, do not hide them
             |
             |   - 5 points fitting 3 coefficients leaves 2 degrees of
             |     freedom, so a high R^2 is close to guaranteed and is NOT
             |     evidence of accuracy. 7-10 samples, or holding 2 back as
             |     validation points, is what makes an R^2 mean something.
             |
             |   - BULK DENSITY is a second predictor, not noise. Mendes,
             |     Li et al. (2014), "Evaluation and Calibration of a Soil
             |     Moisture Sensor for Measuring Poultry Manure or Litter
             |     Moisture Content", Applied Engineering in Agriculture
             |     (Iowa State), regressed sensor output against moisture
             |     content AND bulk density, R^2 = 0.95-0.99, and reported
             |     an average error of +/- 6.7% MC for laying-hen manure
             |     specifically. A single-variable fit like this one is only
             |     valid while packing density is held constant — which is
             |     exactly what step C's "consistent firmness" buys. Quote
             |     their +/- 6.7%, not an R^2, as the expected accuracy.
             |     https://dr.lib.iastate.edu/handle/20.500.12876/171
             |
             |   - Temperature shifts the reading slightly: the same study
             |     measured 0.31% of the sensor output per degree C away from
             |     the calibration temperature. Calibrate at roughly house
             |     temperature and this stays well inside the +/- 6.7%.
             |
             |   - A steam/water bath tops out near 100 C, so it leaves a
             |     little bound water behind and biases MC_wb slightly LOW.
             |     It is a defensible field substitute, but do NOT cite
             |     ASABE S358.2 for it: that standard specifies a convection
             |     oven at 103 C for 24 h, or 60 C for 72 h when the dried
             |     solids are to be chemically analysed — the lower setting
             |     existing precisely to avoid driving off organic volatiles.
             |     The 60 C / 72 h option is the honest precedent for drying
             |     gently; the water bath is this project's no-oven
             |     approximation of it and should be written up as that.
             |     https://engineering.purdue.edu/~abe305/moisture/html/page13.htm
             |
             |   - Burying the probe with uniform density and no air gaps is
             |     not a nicety. Air trapped against the sensing element has
             |     a dielectric constant near 1 against water's ~80, so a gap
             |     reads as dryness that no amount of curve fitting can undo.
             |
             |   - The calibration wets the manure while the poultry house
             |     DRIES it, so the two run opposite paths through the same
             |     moisture range. For a dielectric probe this is a minor
             |     effect — it responds to total water content rather than to
             |     the path taken to reach it — unlike a tension-based sensor,
             |     where hysteresis is substantial. Worth stating if asked;
             |     not worth redesigning the procedure around.
             |
             | WHERE THE ERROR ACTUALLY LIVES, largest first. Spend effort in
             | this order — the bottom two are an order of magnitude smaller
             | than the top four, and the procedure is usually argued about at
             | the wrong end:
             |
             |   1. Medium mismatch (padding with soil)      10+ points
             |   2. Material lost per reading (E1 only)      up to 7 points
             |   3. The probe itself                         +/- 6.7% MC
             |   4. Inconsistent packing density             several points
             |   5. Water bath under-drying (~100 C)         1-3 points
             |   6. Single drying run (mass balance)         0.3-0.7 points
             |   7. Scale resolution (+/- 1 g on 240 g)      0.3 points
             |
             | #3 is a FLOOR, not a mistake to avoid: it is what Mendes et al.
             | achieved with a research-grade EC-5 and bulk density in the
             | model, so no procedure here beats it. Everything else on this
             | list is error added on top of it.
             |
             | All of 1, 2, 4, 5 and 6 are systematic: they shift the whole
             | curve rather than scattering points around it, which is why
             | they matter more than their size suggests when the output is
             | then compared against fixed 25 / 35 cut points.
             |
             | WHY raw_min / raw_max ARE REQUIRED, NOT OPTIONAL
             |
             | Two separate failure modes, both silent without them:
             |
             |   EXTRAPOLATION. Outside the five samples' span the curve is
             |   an assumption, not a measurement. A raw count past either
             |   end is clamped to that end's MC rather than extended — the
             |   same policy as 'max_ppm' for ammonia.
             |
             |   REVERSAL. Every parabola turns at S = -b / 2a. On the far
             |   side of that vertex moisture moves the WRONG way: wetter
             |   manure would report drier. If the vertex falls inside
             |   raw_min..raw_max the fit is not usable across the operating
             |   range at all, and SensorCalibrationService rejects the whole
             |   polynomial and falls back, rather than trusting the half of
             |   it that happens to point the right way.
             |
             | SET THEM PER DEVICE. Capacitive probes vary unit to unit, and
             | a fit measured with one probe makes another worse. The
             | unsuffixed keys exist only as a single-device fallback:
             |
             |     MOISTURE_POLY_A_AGB_D01=-0.0000081
             |     MOISTURE_POLY_B_AGB_D01=0.0612
             |     MOISTURE_POLY_C_AGB_D01=-52.4
             |     MOISTURE_RAW_MIN_AGB_D01=1480
             |     MOISTURE_RAW_MAX_AGB_D01=3010
             |
             | a may be 0 — that is a straight-line fit, which is what the
             | poultry literature above actually used, and it is accepted.
             */
            'poly' => [
                'a' => env('MOISTURE_POLY_A') !== null ? (float) env('MOISTURE_POLY_A') : null,
                'b' => env('MOISTURE_POLY_B') !== null ? (float) env('MOISTURE_POLY_B') : null,
                'c' => env('MOISTURE_POLY_C') !== null ? (float) env('MOISTURE_POLY_C') : null,
                'raw_min' => env('MOISTURE_RAW_MIN') !== null ? (int) env('MOISTURE_RAW_MIN') : null,
                'raw_max' => env('MOISTURE_RAW_MAX') !== null ? (int) env('MOISTURE_RAW_MAX') : null,
            ],

            /*
             | FALLBACK 2 — the two-point air/water index. Not MC_wb; see the
             | block above for why. Still strictly better than the
             | placeholder, because it at least uses this probe's own range:
             |
             |   MOISTURE_RAW_AIR    probe held in open air, completely dry
             |   MOISTURE_RAW_WATER  probe in water up to (not past) its line
             |
             |   index = (air - raw) / (air - water) * 100
             */
            'raw_air' => env('MOISTURE_RAW_AIR') !== null ? (int) env('MOISTURE_RAW_AIR') : null,
            'raw_water' => env('MOISTURE_RAW_WATER') !== null ? (int) env('MOISTURE_RAW_WATER') : null,
        ],

        /*
         | AMMONIA — MQ-137.
         |
         | ppm = 10 ^ ((log10(Rs/Ro) - intercept) / slope)
         |
         | Equivalent to the power law written in most MQ references,
         | ppm = a * (Rs/Ro)^k, with a = 10^(-intercept/slope) and
         | k = 1/slope. Same curve, different parameterisation. The method
         | itself is published:
         |
         |   Vega, J., Martinez, J. & Verdu, C. (2024). "Multisensory system
         |   for non-invasive monitoring and measuring of laboratory animal
         |   welfare." Automatika 65(3), 1044-1058 - stabilise the sensor,
         |   take Ro in fresh air, compute Rs from the divider, then invert
         |   log(y) = m*log(x) + b as x = 10^((log y - b)/m).
         |   doi:10.1080/00051144.2024.2331371
         |
         | HARDWARE, from the Hanwei MQ-137 technical data sheet:
         |
         |   Vc  = 5V +/- 0.1      circuit voltage
         |   Vh  = 5V +/- 0.1      heating voltage
         |   RL  = 47k             used for the sensitivity curve (10k-100k ok)
         |   Ro  = 900K - 4900K    sensing resistance in air
         |   scope = 5 - 200ppm    rated detecting range
         |   preheat > 24 hours
         |
         | Reported wiring (2026-10-10): AOUT -> one 10k -> GPIO35, VCC -> VIN
         | (nominal 5V), common GND, DOUT -> GPIO27. The single series resistor
         | does NOT provide a known voltage-divider ratio or a safe voltage
         | ceiling. Input protection and actual supply/output need checking.
         | raw * 3.3 / 4095 is a legacy voltage approximation, NOT a calibrated
         | ESP32 ADC transfer function. ADC_11db does not establish that mapping.
         | See firmware/README.md for the serial millivolt diagnostic and limits.
         |
         | THE ONE MEASURED VALUE:
         |
         |   AMMONIA_RAW_CLEAN_AIR   raw ADC in clean outdoor air, after the
         |                           sensor has been powered continuously for
         |                           at least 24h (the datasheet's preheat)
         |
         | PROVENANCE OF EACH CONSTANT - read this before quoting any of them:
         |
         |   slope  -0.311   LEGACY, UNVALIDATED. The previous derivation used
         |                   log10(0.65) / log10(200/50). Visual review of the
         |                   supplied Hanwei PDF instead shows alpha(20/10)
         |                   <= 0.65. This bound is not an exact log-log slope.
         |                   Do not replace it with log10(0.65)/log10(2), either.
         |                   A replacement needs a matching sensor curve/fit,
         |                   verified voltage conversion and held-out validation.
         |                   Source: https://www.datasheethub.com/wp-content/uploads/2022/09/NH3.pdf
         |                   Retained ONLY for compatibility pending that work;
         |                   current ppm outputs are not validated measurements.
         |
         |   intercept 0.498 NOT SOURCED. It only fixes where the curve sits,
         |                   and is set to preserve this file's long-standing
         |                   anchor of Rs/Ro = 1 at ~40 ppm:
         |                   -slope * log10(40) = 0.311 * 1.602 = 0.498.
         |                   Recomputed alongside the slope purely so the
         |                   slope correction does not silently shift every
         |                   stored reading by ~44%.
         |
         |   clean_air_ratio 3.6
         |                   ASSUMED - NOT FROM THE MQ-137 DATASHEET.
         |                   Its provenance and Ro definition have not been
         |                   established for this module. Retained for legacy
         |                   continuity; do not cite it as a verified value.
         |
         | WHAT A REFERENCE PAIR DOES AND DOES NOT ESTABLISH:
         |
         | Take ONE simultaneous pair - this device's raw reading and a
         | calibrated NH3 meter's ppm - in a real poultry house. Dividing the
         | power law by itself at that point cancels BOTH Ro and a:
         |
         |     ppm = C_ref * (Rs / Rs_ref) ^ (1/slope)
         |
         | clean_air_ratio and intercept cancel, but slope and the voltage
         | mapping still need validation. A median pair does not validate them.
         | October 10 meter observations (0.01-0.06 ppm) are below this PDF's
         | published 5-200 ppm scope; do not use them to approve a ppm model.
         | Keep timestamp matches as observations. Reused database rows are
         | not additional sensor samples. Validate with separate measurements
         | spanning the intended range after the circuit/model are established.
         | Compare Hofstetter, Fabian & Lorenzoni (2021), Sensors 21(19),
         | 6664 (MQ-137 within 1.4% of an infrared analyser at 65.4 ppm,
         | doi:10.3390/s21196664) and Elwakeel (2025), Sci Rep 15, 31630
         | (R^2 = 0.9883 against a BT-5800G over 5-95 ppm).
         |
         | Do NOT copy Elwakeel's published C = 189.4 * Vout^-1.08. Its
         | negative exponent means ppm FALLS as Vout rises, i.e. their
         | divider is wired the other way round from ours. Dropping those
         | constants in here would inverse every reading.
         */
        'ammonia' => [
            // REFERENCE PAIR, conditional on a validated slope/voltage mapping.
            // One simultaneous reading of this device's
            // raw count and a calibrated NH3 meter's ppm, taken in the
            // poultry house. Supplying both switches SensorCalibrationService
            // to ppm = C_ref * (Rs/Rs_ref)^(1/slope), which cancels Ro and
            // retires BOTH unsourced constants below. Per device in practice
            // (AMMONIA_RAW_REF_AGB_D01 / AMMONIA_PPM_REF_AGB_D01); these
            // unsuffixed entries only exist as a single-device fallback.
            'raw_ref' => env('AMMONIA_RAW_REF') !== null ? (int) env('AMMONIA_RAW_REF') : null,
            'ppm_ref' => env('AMMONIA_PPM_REF') !== null ? (float) env('AMMONIA_PPM_REF') : null,

            'raw_clean_air' => env('AMMONIA_RAW_CLEAN_AIR') !== null ? (int) env('AMMONIA_RAW_CLEAN_AIR') : null,
            'clean_air_ratio' => 3.6,
            'slope' => -0.311, // Legacy, unvalidated; see provenance above.
            'intercept' => 0.498,
            'adc_max' => 4095,

            // Legacy ADC voltage approximation and nominal module supply.
            // Neither substitutes for a checked ADC mapping / measured supply.
            'adc_vref' => 3.3,
            'supply_volts' => 5.0,

            // Datasheet rated detecting scope. Past this the curve is an
            // extrapolation, not a measurement, so ppm is clamped here.
            'max_ppm' => 200,
        ],

        /*
         | PER-DEVICE OVERRIDES.
         |
         | Sensors of the same model vary enormously unit to unit, so each
         | device may carry its own calibration:
         |
         |     MOISTURE_POLY_A_AGB_D01=-0.0000081
         |     MOISTURE_POLY_B_AGB_D01=0.0612
         |     MOISTURE_POLY_C_AGB_D01=-52.4
         |     MOISTURE_RAW_MIN_AGB_D01=1480
         |     MOISTURE_RAW_MAX_AGB_D01=3010
         |     MOISTURE_RAW_AIR_AGB_D01=1535
         |     MOISTURE_RAW_WATER_AGB_D01=401
         |     AMMONIA_RAW_CLEAN_AIR_AGB_D01=640
         |     AMMONIA_RAW_REF_AGB_D01=614
         |     AMMONIA_PPM_REF_AGB_D01=12.3
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
         |
         | Kept as-is rather than cast to int: AMMONIA_PPM_REF is a meter
         | reading such as 12.3, and the MOISTURE_POLY_* coefficients are
         | small floats such as -0.0000081. An int cast here would drop the
         | first to 12 and the second to 0, silently flattening the entire
         | moisture curve. SensorCalibrationService casts each one to the
         | type that key actually needs.
         */
        'per_device' => collect($_ENV)
            ->filter(fn ($value, $key) => is_string($key)
                && preg_match('/^(MOISTURE_POLY_A|MOISTURE_POLY_B|MOISTURE_POLY_C|MOISTURE_RAW_MIN|MOISTURE_RAW_MAX|MOISTURE_RAW_AIR|MOISTURE_RAW_WATER|AMMONIA_RAW_CLEAN_AIR|AMMONIA_RAW_REF|AMMONIA_PPM_REF)_.+$/', $key)
                && $value !== '' && $value !== null)
            ->all(),
    ],

];
