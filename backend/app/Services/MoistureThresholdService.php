<?php

namespace App\Services;

/**
 * Manure moisture Safe/Warning/Critical classification. The thresholds
 * live in config/sensors.php ('moisture'); this is the only place the
 * comparison itself is written so ingestion, trend analysis, the demo
 * seeder and the tests can't drift apart.
 *
 *   value <  warning              -> Safe
 *   value >= warning, < critical  -> Warning
 *   value >= critical             -> Critical
 *
 * Always pass the RAW computed value — never a value that has already
 * been rounded for storage/display, so that e.g. 24.996 stays Safe.
 */
class MoistureThresholdService
{
    public function warning(): float
    {
        return (float) config('sensors.moisture.warning');
    }

    public function critical(): float
    {
        return (float) config('sensors.moisture.critical');
    }

    public function classify(float $moisture): string
    {
        if ($moisture >= $this->critical()) {
            return 'Critical';
        }

        if ($moisture >= $this->warning()) {
            return 'Warning';
        }

        return 'Safe';
    }
}
