<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Support\LocalTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Read-only assignment periods for the Farm Record monitoring displays.
 *
 * New changes have ID-based ledger evidence and reading/incident watermarks.
 * Legacy visits keep their original activity-log identities and dates. Only
 * uniquely identifiable old messages establish dates; missing/ambiguous events
 * never become inferred dates. No stored historical records are rewritten.
 * ReadingHistoryService retains its existing device-wide chart behaviour.
 */
class MonitoringDeploymentService
{
    public function events(): array
    {
        if (! Schema::hasTable('activity_logs')) return [];
        $evaluation = now();
        $sensors = Sensor::all()->keyBy('id');
        $names = $sensors->groupBy(fn ($sensor) => $sensor->device_name)
            ->filter(fn ($group) => $group->count() === 1)
            ->map(fn ($group) => $group->first()->id);
        $farms = Farm::all(['id', 'farm_name'])->groupBy('farm_name')
            ->filter(fn ($group) => $group->count() === 1)
            ->map(fn ($group) => $group->first()->id);

        $events = [];
        $logs = ActivityLog::whereIn('action', ['Assigned Sensor', 'Reassigned Sensor', 'Unassigned Sensor'])
            ->where('created_at', '<=', $evaluation)
            ->orderBy('created_at')->orderBy('id')->get();
        foreach ($logs as $log) {
            $matches = [];
            foreach ($names as $name => $sensorId) {
                $prefix = match ($log->action) {
                    'Assigned Sensor' => "Assigned device {$name} to ",
                    'Unassigned Sensor' => "Removed device {$name} from ",
                    default => "Moved device {$name} from ",
                };
                if (! str_starts_with($log->details ?? '', $prefix)) {
                    continue;
                }
                $tail = substr($log->details, strlen($prefix));
                $from = null;
                $to = null;
                if ($log->action === 'Assigned Sensor') {
                    $to = $farms->get($tail);
                } elseif ($log->action === 'Unassigned Sensor') {
                    $from = $farms->get($tail);
                } else {
                    // Names can themselves contain " to "; accept one exact
                    // pair only, rather than guessing which separator it is.
                    $pairs = [];
                    foreach ($farms as $farmName => $fromId) {
                        $farmPrefix = $farmName.' to ';
                        if (str_starts_with($tail, $farmPrefix)) {
                            $toId = $farms->get(substr($tail, strlen($farmPrefix)));
                            if ($toId !== null) {
                                $pairs[] = [$fromId, $toId];
                            }
                        }
                    }
                    if (count($pairs) === 1) {
                        [$from, $to] = $pairs[0];
                    }
                }
                $matches[] = ['sensor_id' => $sensorId, 'from' => $from, 'to' => $to];
            }
            if (count($matches) === 1) {
                $event = $matches[0];
                $events[$event['sensor_id']][] = $event + ['id' => $log->id, 'at' => $log->created_at];
            }
        }

        // New events carry immutable IDs and row watermarks. They remain
        // resolvable after names change and disambiguate events in one second.
        if (Schema::hasTable('device_assignment_events')) {
            $byId = [];
            foreach ($events as $timeline) {
                foreach ($timeline as $event) $byId[$event['id']] = $event;
            }
            foreach (DB::table('device_assignment_events')->where('occurred_at', '<=', $evaluation)->get() as $row) {
                $byId[$row->activity_log_id] = [
                    'id' => (int) $row->activity_log_id, 'sensor_id' => (int) $row->sensor_id,
                    'from' => $row->from_farm_id === null ? null : (int) $row->from_farm_id,
                    'to' => $row->to_farm_id === null ? null : (int) $row->to_farm_id,
                    'at' => Carbon::parse($row->occurred_at),
                    'reading_floor_id' => (int) $row->reading_floor_id,
                    'alert_floor_id' => (int) $row->alert_floor_id,
                ];
            }
            $events = [];
            foreach ($byId as $event) $events[$event['sensor_id']][] = $event;
        }
        foreach ($events as &$timeline) {
            usort($timeline, fn ($a, $b) => ($a['at'] <=> $b['at']) ?: ($a['id'] <=> $b['id']));
        }
        unset($timeline);

        return $events;
    }

    public function forFarm(int $farmId): array
    {
        $evaluation = now();
        $sensors = Sensor::all()->keyBy('id');
        $events = $this->events();

        // Include current devices even before their first transmission, and
        // devices that no longer have a sensor row but left historical data.
        $recordedIds = SensorReading::where('farm_id', $farmId)->whereNotNull('sensor_id')
            ->distinct()->pluck('sensor_id')->all();
        $candidateIds = array_unique(array_merge(
            $recordedIds,
            $sensors->where('farm_id', $farmId)->keys()->all(),
            array_keys(array_filter($events, fn ($list) => collect($list)->contains(
                fn ($event) => $event['from'] === $farmId || $event['to'] === $farmId
            )))
        ));

        $periods = [];
        foreach ($candidateIds as $sensorId) {
            $sensor = $sensors->get($sensorId);
            $timeline = $events[$sensorId] ?? [];
            // Every event is a boundary, including a currently unresolvable
            // event. Thus an unknown gap cannot merge two documented visits.
            for ($i = -1; $i < count($timeline); $i++) {
                $previous = $i >= 0 ? $timeline[$i] : null;
                $next = $timeline[$i + 1] ?? null;
                $start = $previous['at'] ?? null;
                $end = $next['at'] ?? $evaluation;
                if ($start !== null && $start->gt($end)) {
                    continue;
                }
                $owner = $previous !== null ? $previous['to'] : ($next !== null ? $next['from'] : $sensor?->farm_id);
                $current = $next === null && $sensor?->farm_id === $farmId;
                $assignedAt = $previous !== null && $previous['to'] === $farmId ? $start : null;
                $unassignedAt = $next !== null && $next['from'] === $farmId ? $end : null;
                $verified = $assignedAt !== null && ($unassignedAt !== null || ($current && $owner === $farmId));

                $afterId = $previous['reading_floor_id'] ?? null;
                $throughId = $next['reading_floor_id'] ?? null;
                $query = $this->readings($farmId, (int) $sensorId, $start, $end, $afterId, $throughId);
                $summary = $query->selectRaw('COUNT(*) as total, MIN(created_at) as first_at, MAX(created_at) as last_at')->first();
                if ((int) $summary->total === 0 && $owner !== $farmId && ! $current) {
                    continue;
                }
                $interval = (int) config('sensors.expected_sampling_interval_seconds', 60);
                $expected = null;
                $received = null;
                $coverage = null;
                $lastCoveredAt = $end->copy();
                if ($assignedAt !== null && $end->gt($assignedAt)) {
                    $lastCoveredAt->subMicrosecond();
                }
                if ($verified && $interval > 0) {
                    $seconds = $assignedAt->diffInSeconds($end);
                    $expected = (int) ceil($seconds / $interval);
                    if ($expected > 0) {
                        // One occupied sampling slot counts once, even if a
                        // retry or a burst inserted several rows in that slot.
                        $slotExpression = DB::connection()->getDriverName() === 'sqlite'
                            ? "CAST((strftime('%s', created_at) - strftime('%s', ?)) / ? AS INTEGER)"
                            : 'FLOOR(TIMESTAMPDIFF(SECOND, ?, created_at) / ?)';
                        $received = (int) $this->readings($farmId, (int) $sensorId, $start, $end, $afterId, $throughId)
                            ->selectRaw('COUNT(DISTINCT '.$slotExpression.') as slots', [
                                $assignedAt->toDateTimeString(), $interval,
                            ])->value('slots');
                        $coverage = round(min(100, $received / $expected * 100), 1);
                    }
                }

                $periods[] = [
                    'assignment_key' => $sensorId.':'.($previous['id'] ?? 'legacy'),
                    'sensor_id' => (int) $sensorId,
                    'device_name' => $sensor?->device_name ?? "Device #{$sensorId} (removed)",
                    'is_current' => $current,
                    'assigned_at' => $assignedAt?->toIso8601String(),
                    'unassigned_at' => $unassignedAt?->toIso8601String(),
                    'assignment_dates_verified' => $verified,
                    'period_note' => $verified ? null : 'Assignment dates unavailable or incomplete in the activity logs.',
                    'first_reading_at' => $summary->first_at ? Carbon::parse($summary->first_at)->toIso8601String() : null,
                    'last_reading_at' => $summary->last_at ? Carbon::parse($summary->last_at)->toIso8601String() : null,
                    'reading_count' => (int) $summary->total,
                    'days_covered' => $verified ? (int) LocalTime::forDisplay($assignedAt)->startOfDay()
                        ->diffInDays(LocalTime::forDisplay($lastCoveredAt)->startOfDay()) + 1 : null,
                    'data_coverage_percent' => $coverage,
                    'expected_readings' => $expected,
                    'received_sampling_slots' => $received,
                    'sampling_interval_seconds' => $interval,
                    'coverage_evaluated_at' => $verified ? $end->toIso8601String() : null,
                    // Internal query boundaries are also supplied to the daily
                    // summary. They are never presented as assignment dates.
                    'reading_after_id' => $afterId,
                    'reading_through_id' => $throughId,
                    'alert_after_id' => $previous['alert_floor_id'] ?? null,
                    'alert_through_id' => $next['alert_floor_id'] ?? null,
                    'range_start' => $start?->toIso8601String(),
                    'range_end' => $end->toIso8601String(),
                ];
            }
        }

        usort($periods, fn ($a, $b) => strcmp($a['range_start'] ?? '', $b['range_start'] ?? '')
            ?: ($a['sensor_id'] <=> $b['sensor_id'])
            ?: ((int) explode(':', $a['assignment_key'])[1] <=> (int) explode(':', $b['assignment_key'])[1]));

        return $periods;
    }

    public function readings(int $farmId, int $sensorId, ?Carbon $start, Carbon $end, ?int $afterId = null, ?int $throughId = null): Builder
    {
        return SensorReading::where('farm_id', $farmId)->where('sensor_id', $sensorId)
            ->when($afterId !== null, fn ($query) => $query->where('id', '>', $afterId),
                fn ($query) => $query->when($start, fn ($q) => $q->where('created_at', '>=', $start)))
            ->when($throughId !== null, fn ($query) => $query->where('id', '<=', $throughId),
                fn ($query) => $query->where('created_at', $afterId === null ? '<' : '<=', $end));
    }
}
