<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class DeviceAssignmentService
{
    /** Existing device-first barrier shared with registration, houses and deletion. */
    public function withLockedFarm(int $farmId, callable $callback): mixed
    {
        return DB::transaction(function () use ($farmId, $callback) {
            Sensor::orderBy('id')->lockForUpdate()->get(['id']);
            $farm = Farm::whereKey($farmId)->lockForUpdate()->first();

            return $callback($farm);
        });
    }

    /** Legacy explicit bulk operation. Permanent Delete must never call it. */
    public function closeForFarm(Farm $farm): void
    {
        foreach ($farm->sensors()->orderBy('id')->get() as $sensor) {
            $this->change($sensor->id, null);
        }
    }

    public function change(int $sensorId, ?int $farmId): Sensor
    {
        abort_unless(Schema::hasTable('device_assignment_events'), 503,
            'Device assignment history is unavailable. Please contact system support.');

        return DB::transaction(function () use ($sensorId, $farmId) {
            // Ingestion and status updates lock this SAME device before using
            // its farm. Never perform provider calls while holding this lock.
            $sensor = Sensor::whereKey($sensorId)->lockForUpdate()->firstOrFail();
            $farm = $farmId === null ? null : Farm::whereKey($farmId)->lockForUpdate()->firstOrFail();
            if ((int) $sensor->farm_id === (int) $farmId) {
                throw ValidationException::withMessages([
                    'farm_id' => $farm ? 'This device is already assigned to this farm.' : 'This device is not assigned to a farm.',
                ]);
            }
            // Internal compatibility for legacy farm-only records, never the
            // HTTP assignment path. A known house cannot silently be discarded.
            abort_if($farm && $sensor->poultry_house_id, 422, 'An explicit verified poultry house selection is required.');

            return $this->writeTransition($sensor, $farm, null, Auth::user());
        }, 3);
    }

    public function authorizeManager(?User $actor, bool $lock = false): User
    {
        abort_unless($actor, 403);
        $query = User::whereKey($actor->id);
        $current = ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
        abort_unless($current->status === 'active' && in_array($current->role, ['admin', 'super_admin'], true), 403);

        return $current;
    }

    public function version(int $sensorId): int
    {
        return Schema::hasTable('device_assignment_events')
            ? (int) DB::table('device_assignment_events')->where('sensor_id', $sensorId)->max('id') : 0;
    }

    private function locked(User $actor, int $sensorId, ?int $targetFarmId, callable $callback): Sensor
    {
        $this->authorizeManager($actor);
        abort_unless(Schema::hasTable('device_assignment_events'), 503, 'Device assignment history is unavailable.');
        try {
            return DB::transaction(function () use ($actor, $sensorId, $targetFarmId, $callback) {
                $sensor = Sensor::whereKey($sensorId)->lockForUpdate()->firstOrFail();
                $farmIds = array_values(array_unique(array_filter([$sensor->farm_id, $targetFarmId])));
                $farms = Farm::whereIn('id', $farmIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
                $currentActor = $this->authorizeManager($actor, true);
                abort_if($targetFarmId !== null && ! $farms->has($targetFarmId), 404);

                return $callback($sensor, $farms, $currentActor);
            }, 3);
        } catch (QueryException $error) {
            if (str_contains($error->getMessage(), 'sensors_active_house_uq')) {
                throw ValidationException::withMessages(['poultry_house_id' => 'This house already has an Active device. Explicitly unassign or deactivate it before activating another device here.']);
            }
            throw $error;
        }
    }

    private function checkVersion(Sensor $sensor, ?int $farmId, ?int $houseId, int $expected): bool
    {
        $events = DB::table('device_assignment_events')->where('sensor_id', $sensor->id)->orderByDesc('id')->limit(2)->get();
        $version = (int) ($events[0]->id ?? 0);
        $same = (int) $sensor->farm_id === (int) $farmId && (int) $sensor->poultry_house_id === (int) $houseId;
        // One completed transition to this destination is a safe lost-response
        // replay. An intervening A→B→A sequence deliberately fails as stale.
        $singleReplay = $same && $events->isNotEmpty() && (int) ($events[1]->id ?? 0) === $expected
            && (int) $events[0]->to_farm_id === (int) $farmId
            && (int) ($events[0]->to_house_id ?? null) === (int) $houseId;
        abort_unless($expected === $version || $singleReplay, 409,
            'This device assignment changed. Refresh the device and explicitly select the farm and house again.');

        return $same;
    }

    private function activeSlot(Sensor $sensor, int $houseId): void
    {
        abort_if(Sensor::where('poultry_house_id', $houseId)->where('status', 'Active')->where('id', '<>', $sensor->id)->exists(), 422,
            'This house already has an Active device. Explicitly unassign or deactivate it before activating another device here.');
    }

    public function assignHouse(User $actor, int $sensorId, int $farmId, int $houseId, int $expectedVersion): Sensor
    {
        $this->authorizeManager($actor);
        app(PoultryHouseService::class)->requireInstalled();

        return $this->locked($actor, $sensorId, $farmId, function ($sensor, $farms, $current) use ($farmId, $houseId, $expectedVersion) {
            $farm = $farms->get($farmId);
            app(PoultryHouseService::class)->requireVerifiedInventory($farm);
            $house = DB::table('poultry_houses')->where('farm_id', $farmId)->where('id', $houseId)->lockForUpdate()->first();
            abort_unless($house && $house->status === 'Active', 422, 'Select an Active poultry house belonging to the selected verified farm.');
            if ($this->checkVersion($sensor, $farmId, $houseId, $expectedVersion)) {
                return $sensor->fresh('farm:id,farm_name');
            }
            if ($sensor->status === 'Active') {
                $this->activeSlot($sensor, $houseId);
            }

            return $this->writeTransition($sensor, $farm, $house, $current);
        });
    }

    public function unassign(User $actor, int $sensorId, int $expectedVersion): Sensor
    {
        return $this->locked($actor, $sensorId, null, function ($sensor, $farms, $current) use ($expectedVersion) {
            if ($this->checkVersion($sensor, null, null, $expectedVersion)) {
                return $sensor->fresh('farm:id,farm_name');
            }

            return $this->writeTransition($sensor, null, null, $current);
        });
    }

    public function updateStatus(User $actor, int $sensorId, string $status): Sensor
    {
        abort_unless(in_array($status, ['Active', 'Inactive'], true), 422);

        return $this->locked($actor, $sensorId, null, function ($sensor, $farms, $current) use ($status) {
            if ($status === 'Active' && $sensor->poultry_house_id) {
                $this->provenance($sensor, true);
                $this->activeSlot($sensor, (int) $sensor->poultry_house_id);
            }
            $sensor->forceFill(['status' => $status])->save();
            ActivityLog::create(['user_id' => $current->id, 'role' => $current->role, 'action' => 'Updated Sensor',
                'details' => 'Updated device '.$sensor->device_name, 'type' => 'Farm']);

            return $sensor->fresh('farm:id,farm_name');
        });
    }

    /** Under the sensor lock: stamp accepted data, never infer legacy attribution. */
    public function provenance(Sensor $sensor, bool $exclusive = false): array
    {
        if (! $sensor->poultry_house_id) {
            return [];
        }
        app(PoultryHouseService::class)->requireInstalled();
        $farm = Farm::whereKey($sensor->farm_id)->firstOrFail();
        app(PoultryHouseService::class)->requireVerifiedInventory($farm);
        $query = DB::table('poultry_houses')->where('id', $sensor->poultry_house_id)->where('farm_id', $sensor->farm_id);
        $house = ($exclusive ? $query->lockForUpdate() : $query->sharedLock())->first();
        abort_unless($house && $house->status === 'Active', 409, 'The device house assignment requires review.');
        $event = DB::table('device_assignment_events')->where('id', $sensor->current_assignment_event_id)
            ->where('sensor_id', $sensor->id)->where('to_farm_id', $sensor->farm_id)->where('to_house_id', $sensor->poultry_house_id)->first();
        abort_unless($event && (int) $event->id === $this->version($sensor->id), 409, 'The device assignment history requires review.');

        return ['poultry_house_id' => (int) $house->id, 'assignment_event_id' => (int) $event->id];
    }

    private function writeTransition(Sensor $sensor, ?Farm $farm, ?object $house, ?User $actor): Sensor
    {
        $previous = $sensor->farm;
        $hasContext = Schema::hasColumn('sensors', 'poultry_house_id');
        $previousHouse = $hasContext && $sensor->poultry_house_id
            ? DB::table('poultry_houses')->where('id', $sensor->poultry_house_id)->first() : null;
        $details = $farm
            ? ($previous ? "Moved device {$sensor->device_name} from {$previous->farm_name} to {$farm->farm_name}"
                : "Assigned device {$sensor->device_name} to {$farm->farm_name}")
            : "Removed device {$sensor->device_name} from {$previous->farm_name}";
        if ($house || $previousHouse) {
            $details .= ' [house context: '.($previousHouse ? 'House '.$previousHouse->house_number : 'unknown/unassigned')
                .' → '.($house ? 'House '.$house->house_number : 'unassigned').']';
        }
        $log = ActivityLog::create(['user_id' => $actor?->id, 'role' => $actor?->role, 'type' => 'Farm',
            'action' => $farm ? ($previous ? 'Reassigned Sensor' : 'Assigned Sensor') : 'Unassigned Sensor', 'details' => $details]);
        $event = ['sensor_id' => $sensor->id, 'activity_log_id' => $log->id,
            'from_farm_id' => $previous?->id, 'to_farm_id' => $farm?->id,
            'reading_floor_id' => (int) SensorReading::where('sensor_id', $sensor->id)->max('id'),
            'alert_floor_id' => (int) AlertHistory::where('sensor_id', $sensor->id)->max('id'), 'occurred_at' => now()];
        if ($hasContext) {
            $event += ['from_house_id' => $previousHouse?->id, 'from_house_number' => $previousHouse?->house_number,
                'to_house_id' => $house?->id, 'to_house_number' => $house?->house_number,
                'from_farm_name' => $previous?->farm_name, 'to_farm_name' => $farm?->farm_name,
                'event_kind' => ! $farm ? 'unassignment' : ($house
                    ? ($previous?->id === $farm->id ? 'house_move' : 'house_assignment')
                    : ($previous ? 'farm_reassignment' : 'farm_assignment'))];
        }
        // The referenced period must exist before updating the current tuple.
        $eventId = DB::table('device_assignment_events')->insertGetId($event);
        $changes = ['farm_id' => $farm?->id];
        if ($hasContext) {
            $changes += ['poultry_house_id' => $house?->id, 'current_assignment_event_id' => $house ? $eventId : null];
        }
        $sensor->forceFill($changes)->save();

        return $sensor->fresh('farm:id,farm_name');
    }

    /** House-only moves do not end the existing farm-level SMS episode. Read-only. */
    public function hasContinuousFarmAssignment(int $farmId, int $throughReadingId): bool
    {
        if (! Schema::hasColumn('device_assignment_events', 'to_house_id')) {
            return false;
        }
        foreach (Sensor::where('farm_id', $farmId)->where('status', 'Active')->get() as $sensor) {
            $last = SensorReading::where('farm_id', $farmId)->where('sensor_id', $sensor->id)->where('id', '<=', $throughReadingId)->max('id');
            if (! $last) {
                continue;
            }
            $transitions = DB::table('device_assignment_events')->where('sensor_id', $sensor->id)->where('reading_floor_id', '>=', $last)->get();
            if ($transitions->isNotEmpty() && $transitions->every(fn ($event) => $event->event_kind === 'house_move'
                && (int) $event->from_farm_id === $farmId && (int) $event->to_farm_id === $farmId && $event->to_house_id !== null)) {
                return true;
            }
        }

        return false;
    }
}
