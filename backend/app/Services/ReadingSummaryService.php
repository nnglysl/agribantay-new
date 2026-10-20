<?php

namespace App\Services;

use App\Models\AlertHistory;
use App\Support\LocalTime;
use Illuminate\Support\Carbon;

/**
 * One row per day per device: what a farm's week actually looked like.
 *
 * WHY A TABLE AND NOT ANOTHER CHART
 * The trend chart (ReadingHistoryService) answers "is this getting better or
 * worse" while staff are deciding whether to dispatch. It cannot be read
 * back later as a record: the points are downsampled, the peaks are a shape
 * rather than a number, and nothing on it can be quoted. A monitoring period
 * that has ended needs figures — the highest ammonia that day, how many
 * alerts it raised, how much of the day the device was actually reporting —
 * and those belong in rows.
 *
 * Peaks, not averages, decide the day's status. A house that sat at 4 ppm
 * for twenty-three hours and touched 22 ppm for one is a house that breached
 * 20 ppm, and an average would hide exactly that. The average is reported
 * beside the peak so the two can be read against each other: a high peak
 * with a low average is a spike, a high peak with a high average is a house
 * that never cleared.
 */
class ReadingSummaryService
{
    /**
     * Daily rows for every device that recorded at this farm, grouped by
     * deployment, newest day first within each.
     *
     * MonitoringDeploymentService resolves individual assignment visits;
     * repeated visits by the same device must not share a daily aggregate.
     */
    public function forFarm(int $farmId): array
    {
        $deployments = app(MonitoringDeploymentService::class)->forFarm($farmId);

        return array_values(array_map(
            fn (array $deployment) => $this->summariseDeployment($farmId, $deployment),
            $deployments
        ));
    }

    private function summariseDeployment(int $farmId, array $deployment): array
    {
        $sensorId = $deployment['sensor_id'];

        // Grouped in SQL rather than in PHP: a week at one reading a minute
        // is around ten thousand rows per device, and the point of this
        // screen is to never load them.
        $localDay = $this->localDayExpression('created_at');

        $start = $deployment['range_start'] ? Carbon::parse($deployment['range_start']) : null;
        $end = Carbon::parse($deployment['range_end']);
        $days = app(MonitoringDeploymentService::class)->readings($farmId, $sensorId, $start, $end)
            ->selectRaw("{$localDay} as day")
            ->selectRaw('COUNT(*) as reading_count')
            ->selectRaw('MAX(ammonia) as ammonia_peak, AVG(ammonia) as ammonia_avg')
            ->selectRaw('MAX(moisture) as moisture_peak, AVG(moisture) as moisture_avg')
            ->selectRaw('MAX(temperature) as temperature_peak, AVG(temperature) as temperature_avg')
            ->selectRaw('AVG(humidity) as humidity_avg')
            // The day's worst status per metric, taken from the stored
            // *_status columns rather than recomputed here, so the table can
            // never disagree with the alert that was actually raised.
            ->selectRaw("SUM(CASE WHEN ammonia_status = 'Critical' THEN 1 ELSE 0 END) as ammonia_critical")
            ->selectRaw("SUM(CASE WHEN ammonia_status = 'Warning' THEN 1 ELSE 0 END) as ammonia_warning")
            ->selectRaw("SUM(CASE WHEN moisture_status = 'Critical' THEN 1 ELSE 0 END) as moisture_critical")
            ->selectRaw("SUM(CASE WHEN moisture_status = 'Warning' THEN 1 ELSE 0 END) as moisture_warning")
            ->groupByRaw($localDay)
            ->orderByRaw("{$localDay} DESC")
            ->get();

        $alertsByDay = $this->alertCountsByDay($farmId, $sensorId, $start, $end);

        $rows = $days->map(function ($day) use ($alertsByDay) {
            // Local-zoned, so ->startOfDay()/->endOfDay() below bound the
            // Philippine calendar day rather than the UTC one, and
            // ->toDateString() prints the date a reader would call it.
            $date = LocalTime::startOfLocalDay($day->day);

            return [
                'date' => $date->toDateString(),
                'reading_count' => (int) $day->reading_count,
                'ammonia_peak' => $this->round($day->ammonia_peak, 1),
                'ammonia_avg' => $this->round($day->ammonia_avg, 1),
                'moisture_peak' => $this->round($day->moisture_peak, 0),
                'moisture_avg' => $this->round($day->moisture_avg, 0),
                'temperature_peak' => $this->round($day->temperature_peak, 1),
                'temperature_avg' => $this->round($day->temperature_avg, 1),
                'humidity_avg' => $this->round($day->humidity_avg, 0),
                'alerts_raised' => $alertsByDay[$date->toDateString()] ?? 0,
                'status' => $this->dayStatus($day),
            ];
        })->all();

        return array_merge($deployment, [
            'total_readings' => $deployment['reading_count'],
            'rows' => $rows,
        ]);
    }

    /**
     * Alerts actually raised, read from alert_history rather than counted
     * from Critical readings. A single incident spans many readings while it
     * stays unresolved; counting rows would report one breach as hundreds.
     */
    private function alertCountsByDay(int $farmId, int $sensorId, ?Carbon $start, Carbon $end): array
    {
        // Grouped on the same local day as the readings above, or an alert
        // raised after 4 PM Manila would be counted against the next row.
        $localDay = $this->localDayExpression('triggered_at');

        return AlertHistory::query()
            ->where('farm_id', $farmId)
            ->where('sensor_id', $sensorId)
            ->when($start, fn ($query) => $query->where('triggered_at', '>=', $start))
            ->where('triggered_at', '<', $end)
            ->selectRaw("{$localDay} as day, COUNT(*) as total")
            ->groupByRaw($localDay)
            ->pluck('total', 'day')
            ->map(fn ($total) => (int) $total)
            ->all();
    }

    /**
     * SQL that turns a stored UTC instant into its PHILIPPINE calendar date.
     *
     * Timestamps are stored in UTC (config('app.timezone') === 'UTC') while
     * every reader of this table is in San Jose, UTC+8. A bare DATE(created_at)
     * therefore cuts the day at 4 PM Manila: everything a farm recorded between
     * 4 PM and midnight landed in the NEXT day's row. On a screen whose whole
     * purpose is "what did this farm look like on this day", that silently
     * moved a third of each day's readings — including the evening ammonia
     * rise, which is exactly the part worth reading.
     *
     * The offset is taken from the display timezone rather than hard-coded, so
     * it follows config('app.display_timezone') like every other local-time
     * conversion in LocalTime. The Philippines observes no DST, so a fixed
     * offset is exact; if APP_TIMEZONE is ever set to Asia/Manila the stored
     * instants are already local and this still resolves correctly because the
     * offset is computed against the same clock.
     *
     * CONVERT_TZ is deliberately not used: it returns NULL unless the server's
     * named timezone tables have been populated, which is not guaranteed on
     * shared hosting, and a silent NULL here would collapse every row into one.
     * DATE_ADD with a minute interval works identically on MySQL 8 and the
     * MariaDB 11 running in production.
     */
    private function localDayExpression(string $column): string
    {
        $minutes = (int) round(
            Carbon::now(LocalTime::timezone())->getOffset() / 60
        );

        if ($minutes === 0) {
            return "DATE({$column})";
        }

        return "DATE(DATE_ADD({$column}, INTERVAL {$minutes} MINUTE))";
    }

    /**
     * The day's overall status, from the metrics that raise alerts —
     * config('sensors.alerting_metrics'). Temperature and humidity are
     * recorded and charted but advisory only, so a warm afternoon must not
     * mark the day as a breach.
     */
    private function dayStatus($day): string
    {
        $alerting = config('sensors.alerting_metrics', ['ammonia']);

        $critical = 0;
        $warning = 0;

        foreach ($alerting as $metric) {
            $critical += (int) ($day->{$metric.'_critical'} ?? 0);
            $warning += (int) ($day->{$metric.'_warning'} ?? 0);
        }

        if ($critical > 0) {
            return 'Critical';
        }

        return $warning > 0 ? 'Warning' : 'Safe';
    }

    private function round($value, int $decimals): ?float
    {
        return $value === null ? null : round((float) $value, $decimals);
    }
}
