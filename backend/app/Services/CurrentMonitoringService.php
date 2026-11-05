<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/** Assignment-scoped current state. Historical queries must not use this resolver. */
class CurrentMonitoringService
{
    /** Capture assignment identity and all recommendation inputs together. */
    public function capture(Farm $farm, callable $read): ?array
    {
        return app(DeviceAssignmentService::class)->withLockedFarm($farm->id, function ($locked) use ($read) {
            if (! $locked || ($context = $this->context($locked)) === '') {
                return null;
            }
            $snapshot = ['context' => $context, 'revision' => $this->revision($locked->id)];
            $data = $read($locked);

            // Also fail closed for same-connection changes made by callbacks.
            return $this->matches($locked, $snapshot) ? $snapshot + ['data' => $data] : null;
        });
    }

    /** Atomically revalidate before reading/writing a scoped cache. No HTTP. */
    public function withSnapshot(int $farmId, array $snapshot, callable $callback): mixed
    {
        return app(DeviceAssignmentService::class)->withLockedFarm($farmId, function ($farm) use ($snapshot, $callback) {
            return $farm && $this->matches($farm, $snapshot) ? $callback() : null;
        });
    }

    public function snapshotIsCurrent(int $farmId, array $snapshot): bool
    {
        return $this->withSnapshot($farmId, $snapshot, fn () => true) === true;
    }

    public function revision(int $farmId): string
    {
        return (string) Cache::get("monitoring-insight-revision-{$farmId}", '0');
    }

    public function invalidateInsights(int $farmId): void
    {
        Cache::forever("monitoring-insight-revision-{$farmId}", (string) Str::uuid());
    }

    private function matches(Farm $farm, array $snapshot): bool
    {
        return ($snapshot['context'] ?? '') !== ''
            && $this->context($farm) === $snapshot['context']
            && $this->revision($farm->id) === $snapshot['revision'];
    }

    public function boundary(Sensor $sensor): ?array
    {
        if (! $sensor->farm_id || ! $sensor->isActive()) {
            return null;
        }
        $events = app(MonitoringDeploymentService::class)->events();
        $timeline = $events[$sensor->id] ?? [];
        $last = end($timeline) ?: null;

        return $last && $last['to'] === (int) $sensor->farm_id ? $last : null;
    }

    public function readings(Sensor $sensor, ?int $farmId = null): Builder
    {
        // Callers may hold a relation loaded before a concurrent reassignment.
        $current = Sensor::find($sensor->id);
        $query = SensorReading::where('sensor_id', $sensor->id)
            ->where('farm_id', $farmId ?? $sensor->farm_id)
            ->where('created_at', '<=', now());
        if (! $current || (int) $current->farm_id !== (int) ($farmId ?? $sensor->farm_id)
            || ! ($boundary = $this->boundary($current))) {
            return $query->whereRaw('1 = 0');
        }

        return $this->afterBoundary($query, $boundary, 'id', 'created_at', 'reading_floor_id');
    }

    public function latest(Sensor $sensor, ?int $farmId = null): ?SensorReading
    {
        return $this->readings($sensor, $farmId)->orderByDesc('created_at')->orderByDesc('id')->first();
    }

    public function latestPerDevice(Farm $farm, bool $freshOnly = false): Collection
    {
        return $farm->sensors()->where('status', 'Active')->get()
            ->map(function (Sensor $sensor) use ($farm, $freshOnly) {
                if ($freshOnly && ! $sensor->isOnline()) {
                    return null;
                }
                $query = $this->readings($sensor, $farm->id);
                if ($freshOnly) {
                    $query->where('created_at', '>', now()->subMinutes(config('sensors.offline_after_minutes', 3)));
                }

                return $query->orderByDesc('created_at')->orderByDesc('id')->first();
            })->filter()->values();
    }

    public function forFarm(Farm $farm): Builder
    {
        $query = SensorReading::where('farm_id', $farm->id)->where('created_at', '<=', now());

        return $this->scopeCurrent($query, $farm->id, 'created_at', 'reading_floor_id');
    }

    public function incidents(Builder $query, int $farmId): Builder
    {
        return $this->scopeCurrent($query->where('farm_id', $farmId), $farmId, 'triggered_at', 'alert_floor_id');
    }

    public function context(Farm $farm): string
    {
        return $farm->sensors()->where('status', 'Active')->orderBy('id')->get()
            ->map(function ($sensor) {
                $boundary = $this->boundary($sensor);

                return $boundary ? $sensor->id.':'.$boundary['id'] : null;
            })->filter()->implode(',');
    }

    public function scopeDeviceIncidents(Builder $query, Sensor $sensor): Builder
    {
        $boundary = $this->boundary($sensor);
        if (! $boundary) {
            return $query->whereRaw('1 = 0');
        }

        return $this->afterBoundary($query->where('farm_id', $sensor->farm_id)
            ->where('sensor_id', $sensor->id), $boundary, 'id', 'triggered_at', 'alert_floor_id');
    }

    private function scopeCurrent(Builder $query, int $farmId, string $timeColumn, string $floor): Builder
    {
        $devices = Sensor::where('farm_id', $farmId)->where('status', 'Active')->get();
        $boundaries = $devices->map(fn ($sensor) => [$sensor, $this->boundary($sensor)])
            ->filter(fn ($entry) => $entry[1] !== null);
        if ($boundaries->isEmpty()) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(function ($where) use ($boundaries, $timeColumn, $floor) {
            foreach ($boundaries as [$sensor, $boundary]) {
                $where->orWhere(function ($device) use ($sensor, $boundary, $timeColumn, $floor) {
                    $this->afterBoundary($device->where('sensor_id', $sensor->id), $boundary, 'id', $timeColumn, $floor);
                });
            }
        });
    }

    private function afterBoundary(Builder $query, array $boundary, string $idColumn, string $timeColumn, string $floor): Builder
    {
        if (array_key_exists($floor, $boundary)) {
            return $query->where($idColumn, '>', $boundary[$floor]);
        }

        // Old logs have only second-resolution timestamps. Exclude the whole
        // ambiguous boundary second; never assume an earlier row belongs here.
        return $query->where($timeColumn, '>', $boundary['at']);
    }
}
