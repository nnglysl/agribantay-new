<?php

namespace App\Services;

use App\Models\Sensor;
use App\Models\SensorReading;

/**
 * Time-series readings for the trend charts.
 *
 * Until this existed, every screen in the system showed only the LATEST
 * reading per device. That answers "is something wrong now" but never
 * "is it getting better or worse" — which is the question an Admin deciding
 * whether to dispatch, and a farmer deciding whether their fix worked,
 * actually has.
 *
 * Deliberately NOT a raw log. Readings arrive every few minutes, so a full
 * day is hundreds of rows per device; dumping them in a table is unreadable
 * and dumping them all into a chart is unnecessary. Points are evenly
 * downsampled to at most MAX_POINTS, and they stay REAL measured readings
 * rather than hourly averages — averaging would flatten exactly the spikes
 * the chart exists to reveal.
 */
class ReadingHistoryService
{
    private const MAX_POINTS = 120;
    public const DEFAULT_HOURS = 24;

    /** Metrics charted, in the order the UI shows them. */
    public const METRICS = ['ammonia', 'temperature', 'humidity', 'moisture'];

    /**
     * One series per device installed at the farm, oldest point first.
     *
     * Readings are matched by sensor_id, so a device that has since moved to
     * another farm keeps the readings it took here — the same rule the rest
     * of the system uses (a reading belongs to the farm it was taken at).
     */
    public function forFarm(int $farmId, int $hours = self::DEFAULT_HOURS): array
    {
        $since = now()->subHours($hours);

        $sensors = Sensor::where('farm_id', $farmId)
            ->orderBy('installed_at')
            ->get();

        return $sensors->map(function (Sensor $sensor) use ($farmId, $since) {
            $rows = SensorReading::where('farm_id', $farmId)
                ->where('sensor_id', $sensor->id)
                ->where('created_at', '>=', $since)
                ->orderBy('created_at')
                ->get([
                    'created_at',
                    'ammonia', 'temperature', 'humidity', 'moisture',
                ]);

            return [
                'sensor_id'   => $sensor->id,
                'device_name' => $sensor->device_name,
                'points'      => $this->downsample($rows),
            ];
        })->values()->all();
    }

    /**
     * Keeps every row while under the cap. Past it, steps evenly through the
     * set and always keeps the newest row, so the right-hand end of the chart
     * is the current reading rather than whatever the stride happened to land
     * on.
     */
    private function downsample($rows): array
    {
        $total = $rows->count();

        if ($total === 0) {
            return [];
        }

        $step = (int) max(1, ceil($total / self::MAX_POINTS));

        $kept = $rows->filter(fn($row, $i) => $i % $step === 0 || $i === $total - 1);

        return $kept->map(fn($r) => [
            't'           => $r->created_at->toIso8601String(),
            'ammonia'     => $r->ammonia === null ? null : (float) $r->ammonia,
            'temperature' => $r->temperature === null ? null : (float) $r->temperature,
            'humidity'    => $r->humidity === null ? null : (float) $r->humidity,
            'moisture'    => $r->moisture === null ? null : (float) $r->moisture,
        ])->values()->all();
    }
}
