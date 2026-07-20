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
    // Mirrors SensorIngestController's status() calibration exactly —
    // single source of truth would be better long-term (extract both to
    // a shared config), but duplicated here for now to avoid touching
    // the ingestion path.
    private const THRESHOLDS = [
        'ammonia'  => ['warning' => 25, 'critical' => 35],
        'humidity' => ['warning' => 70, 'critical' => 80],
        'moisture' => ['warning' => 60, 'critical' => 70],
    ];

    private const TEMP_CRITICAL_HIGH = 35;
    private const TEMP_WARNING_HIGH  = 32;
    private const TEMP_CRITICAL_LOW  = 18;
    private const TEMP_WARNING_LOW   = 22;

    private const SAMPLE_SIZE = 10;
    private const STABLE_SLOPE_EPSILON = 0.01; // per-hour rate below this counts as "Stable"

    public function analyzeFarm(int $farmId): array
    {
        $readings = SensorReading::where('farm_id', $farmId)
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

        return [
            'sample_size' => $readings->count(),
            'ammonia'     => $this->analyzeSensor($readings, 'ammonia'),
            'temperature' => $this->analyzeSensor($readings, 'temperature'),
            'humidity'    => $this->analyzeSensor($readings, 'humidity'),
            'moisture'    => $this->analyzeSensor($readings, 'moisture'),
        ];
    }

    private function analyzeSensor($readings, string $field): array
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

        $threshold = $this->criticalThresholdFor($field, $slope);
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
     * Temperature is two-sided (too low OR too high is Critical) — picks
     * whichever bound the current trend is actually heading toward.
     * Every other sensor only has one Critical direction (too high).
     */
    private function criticalThresholdFor(string $field, float $slope): ?float
    {
        if ($field === 'temperature') {
            return $slope >= 0 ? self::TEMP_CRITICAL_HIGH : self::TEMP_CRITICAL_LOW;
        }

        return self::THRESHOLDS[$field]['critical'] ?? null;
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

        $alreadyCritical = $field === 'temperature'
            ? ($currentValue >= self::TEMP_CRITICAL_HIGH || $currentValue <= self::TEMP_CRITICAL_LOW)
            : $currentValue >= $threshold;

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