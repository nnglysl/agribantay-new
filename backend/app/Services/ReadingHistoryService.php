<?php

namespace App\Services;

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
     * One series per device that RECORDED at the farm, oldest point first.
     *
     * Devices come from DeploymentHistoryService, not from the assignment
     * column: the study rotates each unit through a farm for about a week,
     * so asking which devices are assigned here right now returns nothing
     * for every farm the rotation has already left — and this chart, which
     * is the whole record of that week, went blank with it. A reading
     * belongs to the farm it was taken at, permanently, so the readings are
     * what the series are built from.
     *
     * A device with nothing inside the requested window is dropped rather
     * than returned empty: on a farm that has hosted several units in turn,
     * keeping them all would add a legend entry and a flat gap for every
     * device that was somewhere else that week.
     */
    public function forFarm(int $farmId, int $hours = self::DEFAULT_HOURS): array
    {
        $since = now()->subHours($hours);

        $deployments = app(DeploymentHistoryService::class)->forFarm($farmId);

        $series = [];

        foreach ($deployments as $deployment) {
            $rows = SensorReading::where('farm_id', $farmId)
                ->where('sensor_id', $deployment['sensor_id'])
                ->where('created_at', '>=', $since)
                ->orderBy('created_at')
                ->get([
                    'created_at',
                    'ammonia', 'temperature', 'humidity', 'moisture',
                ]);

            if ($rows->isEmpty()) {
                continue;
            }

            $series[] = [
                'sensor_id'   => $deployment['sensor_id'],
                'device_name' => $deployment['device_name'],
                'is_current'  => $deployment['is_current'],
                'points'      => $this->downsample($rows),
            ];
        }

        return $series;
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
