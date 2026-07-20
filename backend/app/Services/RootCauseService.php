<?php

namespace App\Services;

/**
 * AI-Assisted Insight Layer, step 2: Root Cause Suggestion.
 *
 * Fuzzy Logic (Mamdani-style inference) — a recognized, classical AI
 * technique, distinct from both statistics (TrendAnalysisService) and
 * machine learning. Every sensor reading is scored across graded
 * membership curves (Low/Medium/High) instead of hard thresholds, then
 * each candidate root cause is scored by combining relevant memberships
 * via min() (the standard fuzzy AND operator). Fully deterministic and
 * auditable — the same inputs always produce the same diagnosis, and
 * every score can be traced back to its exact membership values.
 */
class RootCauseService
{
    /**
     * Trapezoidal membership: degree (0.0-1.0) that $x belongs to a
     * fuzzy set defined by points a<=b<=c<=d. Rises linearly a->b, full
     * membership b->c, falls linearly c->d, zero outside [a,d].
     */
    private function trapezoid(float $x, float $a, float $b, float $c, float $d): float
    {
        if ($x <= $a || $x >= $d) return 0.0;
        if ($x >= $b && $x <= $c) return 1.0;
        if ($x < $b) return ($x - $a) / ($b - $a);
        return ($d - $x) / ($d - $c);
    }

    /**
     * Membership curves built directly from the same Warning/Critical
     * thresholds used everywhere else in the app (SensorIngestController,
     * TrendAnalysisService) — no new numbers invented here.
     */
    private function memberships(array $current): array
    {
        $ammonia     = (float) $current['ammonia'];
        $temperature = (float) $current['temperature'];
        $humidity    = (float) $current['humidity'];
        $moisture    = (float) $current['moisture'];

        return [
            'ammonia_low'     => $this->trapezoid($ammonia, 0, 0, 15, 25),
            'ammonia_medium'  => $this->trapezoid($ammonia, 15, 25, 30, 35),
            'ammonia_high'    => $this->trapezoid($ammonia, 25, 35, 100, 100),

            'moisture_low'    => $this->trapezoid($moisture, 0, 0, 45, 60),
            'moisture_medium' => $this->trapezoid($moisture, 45, 60, 60, 70),
            'moisture_high'   => $this->trapezoid($moisture, 60, 70, 100, 100),

            'humidity_low'    => $this->trapezoid($humidity, 0, 0, 55, 70),
            'humidity_medium' => $this->trapezoid($humidity, 55, 70, 70, 80),
            'humidity_high'   => $this->trapezoid($humidity, 70, 80, 100, 100),

            'temp_cold'       => $this->trapezoid($temperature, 0, 0, 18, 22),
            'temp_normal'     => $this->trapezoid($temperature, 18, 22, 32, 35),
            'temp_hot'        => $this->trapezoid($temperature, 32, 35, 100, 100),
        ];
    }

    /**
     * $current = latest reading values (ammonia/temperature/humidity/moisture).
     * $trend = TrendAnalysisService::analyzeFarm() output, used only for
     * the confidence boost described above.
     */
    public function diagnose(array $current, array $trend): array
    {
        $m = $this->memberships($current);

        $rules = [
            'Manure buildup' => min($m['ammonia_high'], $m['moisture_high'])
                * $this->trendBoost($trend, ['ammonia', 'moisture']),

            'Poor ventilation' => min($m['ammonia_high'], $m['temp_hot'], $m['humidity_low'])
                * $this->trendBoost($trend, ['ammonia', 'temperature']),

            'Excess moisture (drainage or weather)' => min($m['humidity_high'], $m['ammonia_low'])
                * $this->trendBoost($trend, ['humidity']),

            'Litter or bedding saturation' => min($m['moisture_high'], $m['ammonia_medium'])
                * $this->trendBoost($trend, ['moisture']),

            'Normal conditions' => min($m['ammonia_low'], $m['moisture_low'], $m['humidity_low'], $m['temp_normal']),
        ];

        arsort($rules);

        $topCause = array_key_first($rules);
        $topScore = $rules[$topCause];

        return [
            'root_cause'  => $topCause,
            'confidence'  => round($topScore * 100, 1),
            'all_scores'  => array_map(fn($v) => round($v * 100, 1), $rules),
            'memberships' => array_map(fn($v) => round($v, 3), $m),
        ];
    }

    /**
     * Multiplies a rule's score up by up to 15% if the sensors relevant
     * to that specific root cause are actively Rising (per
     * TrendAnalysisService) — a worsening trend strengthens a diagnosis
     * beyond what the current snapshot alone shows. Kept as a simple
     * multiplier rather than a second fuzzy dimension, to keep the rule
     * base readable and auditable.
     */
    private function trendBoost(array $trend, array $relevantSensors): float
    {
        $risingCount = 0;
        foreach ($relevantSensors as $sensor) {
            if (($trend[$sensor]['direction'] ?? null) === 'Rising') {
                $risingCount++;
            }
        }

        $boost = $risingCount / max(count($relevantSensors), 1);
        return 1.0 + (0.15 * $boost); // up to +15%
    }
}