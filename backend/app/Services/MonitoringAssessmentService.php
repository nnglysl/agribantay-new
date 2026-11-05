<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use Illuminate\Database\Eloquent\Builder;

/** Uses measured values + recorded classifications; never reclassifies thresholds. */
class MonitoringAssessmentService
{
    public const POLICY = 'primary_completeness_v1';

    public const PRIMARY = ['ammonia', 'moisture'];

    private const RANK = ['Safe' => 0, 'Warning' => 1, 'Critical' => 2];

    public function reading(?SensorReading $reading): array
    {
        $available = [];
        $missing = [];
        $severity = null;
        foreach (self::PRIMARY as $metric) {
            $value = $reading?->{$metric};
            $status = $reading?->{$metric.'_status'};
            $valid = (is_int($value) || is_float($value) || is_string($value))
                && is_numeric($value) && is_finite((float) $value) && isset(self::RANK[$status ?? '']);
            if (! $valid) {
                $missing[] = $metric;

                continue;
            }
            $available[] = $metric;
            if ($severity === null || self::RANK[$status] > self::RANK[$severity]) {
                $severity = $status;
            }
        }
        $complete = count($available) === count(self::PRIMARY);

        return ['policy' => self::POLICY, 'severity' => $severity,
            'condition' => ! $available ? 'No Readings Yet' : (($severity !== 'Safe' || $complete) ? $severity : 'Incomplete Data'),
            'data_completeness' => $complete ? 'Complete' : ($available ? 'Incomplete' : 'Unavailable'),
            'incomplete_data' => ! $complete, 'available_primary_metrics' => $available, 'missing_primary_metrics' => $missing];
    }

    public function device(Sensor $sensor, ?SensorReading $reading): array
    {
        $recorded = $this->reading($reading);
        $fresh = $sensor->isActive() && $sensor->isOnline() && $reading
            && $reading->created_at && $reading->created_at->gt(now()->subMinutes(config('sensors.offline_after_minutes', 3)));
        $current = $fresh ? $recorded : $this->reading(null);
        if (! $sensor->isOnline() || ! $sensor->isActive()) {
            $current['condition'] = 'Offline';
        }

        return $current + ['has_current_primary' => $fresh && $recorded['severity'] !== null,
            'last_recorded_assessment' => $reading ? $recorded : null];
    }

    public function farm(Farm $farm): array
    {
        $sensors = $farm->sensors()->where('status', 'Active')->get();
        $severity = null;
        $complete = 0;
        $reporting = 0;
        $online = 0;
        $hasHistory = false;
        $missing = [];
        foreach ($sensors as $sensor) {
            $reading = app(CurrentMonitoringService::class)->latest($sensor, $farm->id);
            $hasHistory = $hasHistory || $reading !== null;
            $online += (int) $sensor->isOnline();
            $assessment = $this->device($sensor, $reading);
            $complete += (int) ! $assessment['incomplete_data'];
            $reporting += (int) $assessment['has_current_primary'];
            $missing = array_merge($missing, $assessment['missing_primary_metrics']);
            $status = $assessment['severity'];
            if ($status !== null && ($severity === null || self::RANK[$status] > self::RANK[$severity])) {
                $severity = $status;
            }
        }
        $total = $sensors->count();
        $condition = ! $total ? 'Pending Setup' : ($severity === null
            ? (! $online && $hasHistory ? 'Offline' : 'No Readings Yet')
            : (($severity === 'Safe' && $complete !== $total) ? 'Incomplete Data' : $severity));

        return ['policy' => self::POLICY, 'condition' => $condition, 'severity' => $severity,
            'data_completeness' => $total && $complete === $total ? 'Complete' : ($reporting ? 'Incomplete' : 'Unavailable'),
            'incomplete_data' => $total > 0 && $complete !== $total,
            'partial_coverage' => $reporting > 0 && $complete !== $total,
            'total_devices' => $total, 'complete_devices' => $complete, 'reporting_devices' => $reporting,
            'offline_devices' => $total - $online, 'missing_primary_metrics' => array_values(array_unique($missing))];
    }

    public function breakdown(iterable $farms): array
    {
        $counts = array_fill_keys(['normal', 'warning', 'critical', 'pending_setup', 'incomplete_data', 'offline', 'no_readings_yet', 'incomplete_coverage'], 0);
        $keys = ['Safe' => 'normal', 'Warning' => 'warning', 'Critical' => 'critical', 'Pending Setup' => 'pending_setup',
            'Incomplete Data' => 'incomplete_data', 'Offline' => 'offline', 'No Readings Yet' => 'no_readings_yet'];
        foreach ($farms as $farm) {
            $a = $this->farm($farm);
            $counts[$keys[$a['condition']]]++;
            if ($a['incomplete_data']) {
                $counts['incomplete_coverage']++;
            }
        }

        return $counts;
    }

    public function readingCounts(Builder $query): array
    {
        $row = (clone $query)->reorder()->selectRaw('COUNT(*) AS total, SUM(CASE WHEN ammonia IS NOT NULL AND moisture IS NOT NULL THEN 1 ELSE 0 END) AS complete, SUM(CASE WHEN ammonia IS NULL AND moisture IS NULL THEN 1 ELSE 0 END) AS unavailable')->first();
        $total = (int) $row->total;
        $complete = (int) $row->complete;

        return ['policy' => self::POLICY, 'total_readings' => $total, 'complete_readings' => $complete,
            'incomplete_readings' => $total - $complete, 'no_primary_readings' => (int) $row->unavailable];
    }
}
