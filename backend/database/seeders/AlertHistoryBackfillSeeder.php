<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\SensorReading;
use App\Models\AlertHistory;
use App\Services\AlertHistoryService;

/**
 * Backfills alert_history for the four demo farms TrendDemoSeeder
 * already populated with sensor_readings. Those readings were inserted
 * directly (not through SensorIngestController::store()), so they never
 * passed through AlertHistoryService in the first place — this seeder
 * replays them through that exact same service, in chronological order,
 * so the resulting incidents are realistic: correct open/escalate/close
 * behavior, with actual historical dates instead of "just now."
 *
 * Safe to re-run — clears any previously backfilled rows for these farm
 * IDs first, then replays from scratch, rather than appending duplicates.
 */
class AlertHistoryBackfillSeeder extends Seeder
{
    private const DEMO_FARM_IDS = [1, 2, 3, 4];

    public function run(): void
    {
        AlertHistory::whereIn('farm_id', self::DEMO_FARM_IDS)->delete();

        $service = app(AlertHistoryService::class);

        foreach (self::DEMO_FARM_IDS as $farmId) {
            $readings = SensorReading::where('farm_id', $farmId)
                ->orderBy('created_at', 'asc') // oldest first — order matters for open/close logic
                ->get();

            foreach ($readings as $reading) {
                $service->recordReading($farmId, 'ammonia', $reading->ammonia_status, $reading->ammonia, $reading->created_at);
                $service->recordReading($farmId, 'temperature', $reading->temperature_status, $reading->temperature, $reading->created_at);
                $service->recordReading($farmId, 'humidity', $reading->humidity_status, $reading->humidity, $reading->created_at);
                $service->recordReading($farmId, 'moisture', $reading->moisture_status, $reading->moisture, $reading->created_at);
            }
        }
    }
}