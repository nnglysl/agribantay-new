<?php

namespace App\Services;

use App\Models\Sensor;
use App\Models\SensorReading;
use Illuminate\Support\Carbon;

/**
 * Which devices actually recorded at a farm, and when.
 *
 * WHY THIS EXISTS
 * The study rotates a small number of devices between farms, roughly a week
 * each, so "the devices at this farm" cannot be answered from
 * Sensor::where('farm_id', ...) — that column holds only the CURRENT
 * assignment. The moment a unit is moved on, that query returns nothing for
 * the farm it just spent a week at, and every screen built on it goes blank
 * even though the readings are all still there.
 *
 * The readings themselves are the reliable record: each row copies the
 * farm_id and sensor_id in force at ingestion time and is never rewritten
 * afterwards (see SensorController's assign/unassign). So deployment is
 * derived from the readings, not from the assignment column — the farm keeps
 * what it measured, permanently, and the device that took those measurements
 * is still named.
 *
 * KNOWN LIMITATION
 * A deployment is one span per device per farm: the first and last reading
 * that device took here. If the same unit were installed, removed, and later
 * brought back to the same farm, both visits collapse into a single span
 * covering the gap between them. The rotation schedule gives each device one
 * window per farm, so this is not split here; splitting on gaps would need a
 * threshold that a long LTE outage would trip by mistake.
 */
class DeploymentHistoryService
{
    /**
     * Every device that has recorded at this farm, oldest deployment first.
     *
     * Returned per device:
     *   sensor_id, device_name, first_reading_at, last_reading_at,
     *   reading_count, days_covered, is_current
     *
     * is_current distinguishes the unit installed right now from the ones
     * that have moved on, so the UI can label a past deployment as past
     * rather than showing a device that is no longer there as Offline.
     */
    public function forFarm(int $farmId): array
    {
        $spans = SensorReading::query()
            ->where('farm_id', $farmId)
            ->whereNotNull('sensor_id')
            ->selectRaw('sensor_id, MIN(created_at) as first_at, MAX(created_at) as last_at, COUNT(*) as reading_count')
            ->groupBy('sensor_id')
            ->orderByRaw('MIN(created_at)')
            ->get();

        if ($spans->isEmpty()) {
            return [];
        }

        // One lookup for every device named, rather than one per span. A unit
        // deleted since it recorded here leaves its readings behind, so the
        // name has to tolerate a missing sensor row.
        $sensors = Sensor::whereIn('id', $spans->pluck('sensor_id'))->get()->keyBy('id');

        return $spans->map(function ($span) use ($sensors, $farmId) {
            $sensor = $sensors->get($span->sensor_id);
            $firstAt = Carbon::parse($span->first_at);
            $lastAt = Carbon::parse($span->last_at);

            return [
                'sensor_id' => (int) $span->sensor_id,
                'device_name' => $sensor?->device_name ?? "Device #{$span->sensor_id} (removed)",
                'first_reading_at' => $firstAt->toIso8601String(),
                'last_reading_at' => $lastAt->toIso8601String(),
                'reading_count' => (int) $span->reading_count,
                // Inclusive of both end days: a device that recorded on the
                // 1st and again on the 7th covered 7 days, not 6.
                'days_covered' => $firstAt->copy()->startOfDay()->diffInDays($lastAt->copy()->startOfDay()) + 1,
                'is_current' => $sensor !== null && $sensor->farm_id === $farmId,
            ];
        })->values()->all();
    }

    /**
     * The sensor ids that have recorded at this farm, oldest first — the
     * single place other services go to ask "which devices belong in this
     * farm's history", so none of them reach for the assignment column
     * again.
     */
    public function sensorIdsForFarm(int $farmId): array
    {
        return array_column($this->forFarm($farmId), 'sensor_id');
    }
}
