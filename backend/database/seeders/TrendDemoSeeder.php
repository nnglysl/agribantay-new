<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\SensorReading;
use App\Models\Sensor;
use Carbon\Carbon;

/**
 * Generates realistic historical sensor_readings for Trend Analysis
 * testing/demo purposes. Farm 1 gets a genuine Rising trend (heading
 * toward Critical) across all four sensor types — the one to show
 * during a defense demo. Farms 2-4 cover Stable, Falling, and Noisy
 * patterns respectively, exercising every branch of
 * TrendAnalysisService's direction/projection logic.
 *
 * Adds NEW readings spaced over roughly the last 36 hours, ending at
 * now() — doesn't touch or delete the original single seeded reading
 * per farm, which will simply fall outside TrendAnalysisService's
 * "last 10 readings" window once these are added.
 */
class TrendDemoSeeder extends Seeder
{
    private const READINGS_PER_FARM = 10;
    private const HOURS_BETWEEN_READINGS = 4; // ~36 hours of history per farm

    public function run(): void
    {
        $this->seedFarm(1, 'rising');
        $this->seedFarm(2, 'stable');
        $this->seedFarm(3, 'falling');
        $this->seedFarm(4, 'noisy');
    }

    private function seedFarm(int $farmId, string $pattern): void
    {
        $sensor = Sensor::where('farm_id', $farmId)->first();
        $now = Carbon::now();

        for ($i = self::READINGS_PER_FARM - 1; $i >= 0; $i--) {
            $timestamp = $now->copy()->subHours($i * self::HOURS_BETWEEN_READINGS);
            $step = self::READINGS_PER_FARM - 1 - $i; // 0 at oldest, increases toward now

            [$ammonia, $temperature, $humidity, $moisture] = $this->valuesFor($pattern, $step);

            SensorReading::create([
                'farm_id'            => $farmId,
                'sensor_id'          => $sensor?->id,
                'ammonia'            => $ammonia,
                'ammonia_status'     => $this->status($ammonia, 25, 35),
                'temperature'        => $temperature,
                'temperature_status' => $this->tempStatus($temperature),
                'humidity'           => $humidity,
                'humidity_status'    => $this->status($humidity, 70, 80),
                'moisture'           => $moisture,
                'moisture_status'    => $this->status($moisture, 60, 70),
                'is_mock'            => true,
                'created_at'         => $timestamp,
                'updated_at'         => $timestamp,
            ]);
        }
    }

    /**
     * Returns [ammonia, temperature, humidity, moisture] for a given
     * $step (0 = oldest reading in the series, 9 = most recent).
     */
    private function valuesFor(string $pattern, int $step): array
    {
        $noise = fn($range) => mt_rand((int) (-$range * 10), (int) ($range * 10)) / 10;

        return match ($pattern) {
            // Climbs steadily from safe levels toward Warning/Critical —
            // the farm to demo "Rising" + a real projected-critical-in-hours.
            'rising' => [
                round(18 + $step * 1.8 + $noise(0.8), 2),   // ammonia: ~18 -> ~34
                round(28 + $step * 0.6 + $noise(0.4), 2),   // temperature: ~28 -> ~33
                round(60 + $step * 1.5 + $noise(1), 2),     // humidity: ~60 -> ~73
                round(45 + $step * 2.0 + $noise(1), 2),     // moisture: ~45 -> ~63
            ],

            // Flat within Normal range the whole time — demonstrates
            // "Stable" direction and a null projection (no risk).
            'stable' => [
                round(15 + $noise(1.5), 2),
                round(27 + $noise(0.5), 2),
                round(55 + $noise(2), 2),
                round(40 + $noise(2), 2),
            ],

            // Starts elevated and improves over time — demonstrates a
            // negative slope correctly producing a null projection
            // (moving away from Critical, not toward it).
            'falling' => [
                round(32 - $step * 1.4 + $noise(0.6), 2),   // ammonia: ~32 -> ~19
                round(31 - $step * 0.3 + $noise(0.3), 2),
                round(75 - $step * 1.2 + $noise(1), 2),
                round(58 - $step * 1.0 + $noise(1), 2),
            ],

            // Realistic noisy Warning-level oscillation — no clean
            // trend, mostly exercises the "Stable" epsilon threshold
            // with real-world jitter instead of a hand-drawn line.
            'noisy' => [
                round(24 + $noise(4), 2),
                round(31 + $noise(1.5), 2),
                round(68 + $noise(5), 2),
                round(55 + $noise(5), 2),
            ],

            default => [15, 27, 55, 40],
        };
    }

    private function status(float $value, float $warningAt, float $criticalAt): string
    {
        if ($value >= $criticalAt) return 'Critical';
        if ($value >= $warningAt) return 'Warning';
        return 'Normal';
    }

    private function tempStatus(float $value): string
    {
        if ($value > 35 || $value < 18) return 'Critical';
        if ($value > 32 || $value < 22) return 'Warning';
        return 'Normal';
    }
}