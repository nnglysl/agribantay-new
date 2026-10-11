<?php

namespace App\Services;

use App\Models\SensorReading;

/**
 * Pure statistical trend analysis — no ML, no external calls. Fits a
 * least-squares line through each sensor's last N readings for a farm,
 * then projects how many hours until that trend crosses the same
 * Warning/Critical thresholds already used by SensorIngestController.
 *
 * This is the deterministic foundation the Root Cause and Recommendation
 * Explanation layers build on top of — this service only ever answers
 * "what direction, how fast, how long until critical," nothing more.
 */
class TrendAnalysisService
{
    // Thresholds are NOT defined here. They used to be — copied from an
    // older version of the ingestion path and then left behind when
    // config/sensors.php moved to researched values, so this service was
    // projecting against ammonia 25/35 and temperature 18/35 while alerts
    // were being raised at 15/20 ppm and 12/30. The same reading could be
    // Critical in the alert and "no projection" in the Root Cause panel
    // beside it, with nothing on screen to explain the disagreement.
    //
    // Everything now comes from config/sensors.php, which carries the
    // sources for each number, so a recalibration moves this service with
    // the rest of the system instead of leaving it behind again.

    private const SAMPLE_SIZE = 10;
    private const STABLE_SLOPE_EPSILON = 0.01; // per-hour rate below this counts as "Stable"

    public function analyzeFarm(int $farmId): array
    {
        $readings = SensorReading::where('farm_id', $farmId)
            // The device is needed to know which ammonia scale these
            // readings are on; without this it is a query per reading.
            ->with('sensor')
            ->latest()
            ->limit(self::SAMPLE_SIZE)
            ->get()
            ->reverse()   // oldest first, so the time axis increases with each point
            ->values();

        if ($readings->count() < 2) {
            return [
                'sample_size' => $readings->count(),
                'ammonia'     => $this->insufficientData(),
                'temperature' => $this->insufficientData(),
                'humidity'    => $this->insufficientData(),
                'moisture'    => $this->insufficientData(),
            ];
        }

        // Which ammonia scale these readings are on. Calibration is per
        // device, so the question is asked of the device that took the most
        // recent reading — the same rule SensorIngestController applies when
        // it classifies one. A calibrated device reports real ppm and is
        // judged against 15/20; an uncalibrated one reports the placeholder
        // scale, where those numbers mean nothing.
        $deviceName = $readings->last()->sensor?->device_name;
        $ammoniaCalibrated = app(SensorCalibrationService::class)->ammoniaIsCalibrated($deviceName);

        return [
            'sample_size' => $readings->count(),
            'ammonia'     => $this->analyzeSensor($readings, 'ammonia', $ammoniaCalibrated),
            'temperature' => $this->analyzeSensor($readings, 'temperature'),
            'humidity'    => $this->analyzeSensor($readings, 'humidity'),
            'moisture'    => $this->analyzeSensor($readings, 'moisture'),
        ];
    }

    private function analyzeSensor($readings, string $field, bool $ammoniaCalibrated = false): array
    {
        $first = $readings->first()->created_at;

        $points = $readings->map(fn($r) => [
            'x' => $first->diffInMinutes($r->created_at) / 60, // hours since first sample
            'y' => (float) $r->{$field},
        ]);

        [$slope] = $this->linearRegression($points);

        $currentValue = (float) $readings->last()->{$field};
        $direction = abs($slope) < self::STABLE_SLOPE_EPSILON
            ? 'Stable'
            : ($slope > 0 ? 'Rising' : 'Falling');

        $threshold = $this->criticalThresholdFor($field, $slope, $ammoniaCalibrated);
        $hoursToCritical = $this->projectTimeToThreshold($slope, $currentValue, $threshold, $field);

        return [
            'direction'                   => $direction,
            'rate_per_day'                => round($slope * 24, 2),
            'current_value'               => $currentValue,
            'projected_critical_in_hours' => $hoursToCritical,
        ];
    }

    /**
     * Ordinary least-squares fit: returns [slope, intercept].
     * Slope is in units-per-hour, since x is expressed in hours.
     */
    private function linearRegression($points): array
    {
        $n = $points->count();
        $sumX  = $points->sum('x');
        $sumY  = $points->sum('y');
        $sumXY = $points->sum(fn($p) => $p['x'] * $p['y']);
        $sumX2 = $points->sum(fn($p) => $p['x'] ** 2);

        $denominator = ($n * $sumX2 - $sumX ** 2);
        if ($denominator == 0) {
            // All readings at the same timestamp (shouldn't normally
            // happen) — treat as flat at the mean value.
            return [0, $n > 0 ? $sumY / $n : 0];
        }

        $slope = ($n * $sumXY - $sumX * $sumY) / $denominator;
        $intercept = ($sumY - $slope * $sumX) / $n;

        return [$slope, $intercept];
    }

    /**
     * Temperature and humidity are two-sided (too low OR too high is
     * Critical) — each picks whichever bound the current trend is actually
     * heading toward. Ammonia and moisture have one Critical direction only
     * (too high).
     *
     * Every number is read from config/sensors.php. See the note at the top
     * of this class for why none of them is written here.
     */
    private function criticalThresholdFor(string $field, float $slope, bool $ammoniaCalibrated = false): ?float
    {
        if ($field === 'temperature' || $field === 'humidity') {
            $cuts = config("sensors.$field");

            return (float) ($slope >= 0 ? $cuts['high_critical'] : $cuts['low_critical']);
        }

        if ($field === 'moisture') {
            return app(MoistureThresholdService::class)->critical();
        }

        if ($field === 'ammonia') {
            $cuts = config($ammoniaCalibrated ? 'sensors.ammonia_ppm' : 'sensors.ammonia_placeholder');

            return (float) $cuts['critical'];
        }

        return null;
    }

    /**
     * Returns hours until the trend line crosses the Critical threshold,
     * or null if the trend is flat/moving away from it (no meaningful
     * projection), or 0 if already past Critical right now.
     */
    private function projectTimeToThreshold(float $slope, float $currentValue, ?float $threshold, string $field): ?float
    {
        if ($threshold === null || abs($slope) < self::STABLE_SLOPE_EPSILON) {
            return null;
        }

        // A two-sided metric is already Critical at either end, whichever
        // bound the projection happens to be aimed at.
        if ($field === 'temperature' || $field === 'humidity') {
            $cuts = config("sensors.$field");
            $alreadyCritical = $currentValue >= $cuts['high_critical'] || $currentValue < $cuts['low_critical'];
        } else {
            $alreadyCritical = $currentValue >= $threshold;
        }

        if ($alreadyCritical) {
            return 0;
        }

        $hours = ($threshold - $currentValue) / $slope;

        // A negative result means the trend is moving away from
        // Critical, not toward it — nothing to project.
        return $hours > 0 ? round($hours, 1) : null;
    }

    private function insufficientData(): array
    {
        return [
            'direction'                   => 'Insufficient data',
            'rate_per_day'                => null,
            'current_value'               => null,
            'projected_critical_in_hours' => null,
        ];
    }
}