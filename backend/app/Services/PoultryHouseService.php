<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\User;
use App\Support\DummyHouseInventory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Ramsey\Uuid\Uuid;

class PoultryHouseService
{
    public const MAX_INITIAL_HOUSES = 1000;

    private function actor(User $actor, bool $manage = false, bool $lock = false): User
    {
        $query = User::whereKey($actor->id);
        $current = ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
        abort_unless($current->status === 'active' && in_array($current->role,
            $manage ? ['admin', 'super_admin'] : ['admin', 'super_admin', 'farm_owner', 'vet'], true), 403);

        return $current;
    }

    private function visibleFarm(User $actor, int $farmId): Farm
    {
        $query = Farm::whereKey($farmId);
        if ($actor->role === 'farm_owner') {
            $query->where('user_id', $actor->id);
        } elseif ($actor->role === 'vet') {
            $query->where('status', 'Active');
        }

        return $query->firstOrFail();
    }

    public function installed(): bool
    {
        return app(PoultryHouseFoundationReadiness::class)->inspect()['ready'];
    }

    public function requireInstalled(): void
    {
        abort_unless($this->installed(), 503,
            'Poultry house registration and management require the approved database foundation to be installed. No registration changes were saved.');
    }

    private function inventoryStatus(Farm $farm): string
    {
        $evidence = DB::table('poultry_house_initializations')->where('farm_id', $farm->id)->first();
        if (DummyHouseInventory::approved($farm, $evidence)) {
            return 'dummy_approved';
        }

        return $farm->house_inventory_verified_at && $evidence && ! DummyHouseInventory::marked($evidence->verification_reference)
            && trim($evidence->verification_reference) !== '' && in_array($evidence->verifier_role, ['admin', 'super_admin'], true)
            ? 'verified' : 'unverified';
    }

    private function requireVerified(Farm $farm): void
    {
        abort_unless(in_array($this->inventoryStatus($farm), ['verified', 'dummy_approved'], true), 409,
            'This farm has no verified house inventory. Existing farms require a separately approved inventory verification before house management.');
        abort_if((int) $farm->last_house_number < (int) DB::table('poultry_houses')->where('farm_id', $farm->id)->max('house_number'), 409,
            'House numbering information is inconsistent. Request an inventory review before making changes.');
    }

    private function summary(object $house): array
    {
        return ['id' => (int) $house->id, 'house_number' => (int) $house->house_number,
            'name' => 'House '.$house->house_number, 'status' => $house->status];
    }

    /** Read-only precondition shared by assignment and accepted-sample provenance. */
    public function requireVerifiedInventory(Farm $farm): void
    {
        $this->requireInstalled();
        $this->requireVerified($farm);
    }

    public function listing(User $actor, int $farmId): array
    {
        $actor = $this->actor($actor);
        $farm = $this->visibleFarm($actor, $farmId);
        if (! $this->installed()) {
            return ['farm_id' => $farmId, 'available' => false, 'inventory_status' => 'unavailable',
                'can_manage' => false, 'houses' => [], 'message' => 'Poultry house records are not available yet. Existing farm monitoring remains available.'];
        }
        $status = $this->inventoryStatus($farm);
        $verified = in_array($status, ['verified', 'dummy_approved'], true);
        $houses = DB::table('poultry_houses')->where('farm_id', $farmId)->orderBy('house_number')->get();
        // A farm-only device is never inferred to belong to House 1. Require
        // all four pieces of the recorded current assignment to agree.
        $devices = DB::table('sensors as s')->join('device_assignment_events as e', function ($join) {
            $join->on('e.id', '=', 's.current_assignment_event_id')->on('e.sensor_id', '=', 's.id')
                ->on('e.to_farm_id', '=', 's.farm_id')->on('e.to_house_id', '=', 's.poultry_house_id');
        })->where('s.farm_id', $farmId)->whereIn('s.poultry_house_id', $houses->pluck('id'))
            ->orderBy('s.id')->get(['s.id', 's.poultry_house_id', 's.label', 's.sensor_code', 's.status'])->groupBy('poultry_house_id');

        return ['farm_id' => $farmId, 'available' => true, 'inventory_status' => $status,
            'can_manage' => $verified && in_array($actor->role, ['admin', 'super_admin'], true),
            'message' => $status === 'dummy_approved' ? DummyHouseInventory::MESSAGE
                : ($verified ? null : 'House inventory has not been verified. Existing farm monitoring remains available.'),
            'houses' => $houses->map(fn ($house) => $this->summary($house) + [
                'assigned_devices' => ($devices->get($house->id) ?? collect())->map(fn ($device) => [
                    'id' => (int) $device->id, 'device_name' => $device->label ?: ($device->sensor_code ?: 'Unnamed device'),
                    'status' => $device->status,
                ])->values()->all(),
            ])->all()];
    }

    /** Internal part of the existing atomic registration; never a legacy-population endpoint. */
    public function initializeRegistration(User $actor, Farm $farm, int $count, string $operationId): void
    {
        $actor = $this->actor($actor, true);
        $this->requireInstalled();
        abort_unless(DB::transactionLevel() > 0 && $farm->wasRecentlyCreated
            && $count >= 1 && $count <= self::MAX_INITIAL_HOUSES, 422, 'A new farm requires at least one poultry house.');
        $at = now();
        $rows = [];
        for ($number = 1; $number <= $count; $number++) {
            $rows[] = ['farm_id' => $farm->id, 'house_number' => $number, 'status' => 'Active',
                'creation_request_id' => (string) Str::uuid(), 'created_at' => $at, 'updated_at' => $at];
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('poultry_houses')->insert($chunk);
        }
        $manifest = DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('house_number')->get(['id', 'house_number']);
        DB::table('poultry_house_initializations')->insert(['farm_id' => $farm->id, 'operation_id' => $operationId,
            'source' => 'registration', 'initial_house_count' => $count,
            'verification_reference' => 'Atomic operational farm registration',
            'manifest_sha256' => hash('sha256', $manifest->toJson()), 'verified_by' => $actor->id,
            'verifier_role' => $actor->role, 'completed_at' => $at]);
        $farm->forceFill(['last_house_number' => $count, 'house_inventory_verified_at' => $at])->save();
        $this->audit($actor, 'Initialized Poultry Houses', $farm, 'Created House 1 through House '.$count.'; registration operation '.$operationId);
    }

    private function manage(User $actor, int $farmId, callable $callback): array
    {
        $this->actor($actor, true);
        $this->requireInstalled();

        return DB::transaction(fn () => app(DeviceAssignmentService::class)->withLockedFarm($farmId,
            function ($farm) use ($actor, $callback) {
                abort_unless($farm, 404);
                $current = $this->actor($actor, true, true);
                $this->requireVerified($farm);

                return $callback($current, $farm);
            }), 3);
    }

    public function add(User $actor, int $farmId, string $requestId, int $count = 1): array
    {
        abort_unless(Str::isUuid($requestId), 422, 'A valid creation request ID is required.');
        abort_unless($count >= 1 && $count <= 100, 422, 'Select between 1 and 100 houses.');

        return $this->manage($actor, $farmId, function ($current, $farm) use ($requestId, $count) {
            $existing = DB::table('poultry_houses')->where('farm_id', $farm->id)->where('creation_request_id', $requestId)->first();
            if ($existing) {
                $houses = DB::table('poultry_houses')->where('farm_id', $farm->id)
                    ->whereBetween('house_number', [$existing->house_number, $existing->house_number + $count - 1])
                    ->orderBy('house_number')->get();
                abort_unless($houses->count() === $count, 409, 'This creation request does not match its original house count.');
                return ['house' => $this->summary($existing), 'houses' => $houses->map(fn ($house) => $this->summary($house))->all(), 'replayed' => true];
            }
            abort_if((int) $farm->last_house_number > PHP_INT_MAX - $count, 422, 'House numbering capacity has been reached.');
            $firstNumber = (int) $farm->last_house_number + 1;
            $now = now();
            $rows = [];
            for ($offset = 0; $offset < $count; $offset++) {
                // The first row is the request's durable idempotency marker. Each
                // additional row has a deterministic companion UUID so the unique
                // per-house request constraint remains intact for a batch.
                $rows[] = ['farm_id' => $farm->id, 'house_number' => $firstNumber + $offset, 'status' => 'Active',
                    'creation_request_id' => $offset === 0 ? $requestId : Uuid::uuid5($requestId, 'house-'.$offset)->toString(),
                    'created_at' => $now, 'updated_at' => $now];
            }
            DB::table('poultry_houses')->insert($rows);
            $lastNumber = $firstNumber + $count - 1;
            $farm->forceFill(['last_house_number' => $lastNumber])->save();
            $this->audit($current, 'Added Poultry House', $farm,
                'Added House '.$firstNumber.($count === 1 ? '' : ' through House '.$lastNumber).'; request '.$requestId);
            $houses = DB::table('poultry_houses')->where('farm_id', $farm->id)->whereBetween('house_number', [$firstNumber, $lastNumber])
                ->orderBy('house_number')->get();

            return ['house' => $this->summary($houses->first()), 'houses' => $houses->map(fn ($house) => $this->summary($house))->all(), 'replayed' => false];
        });
    }

    public function transition(User $actor, int $farmId, int $houseId, string $status): array
    {
        abort_unless(in_array($status, ['Active', 'Inactive'], true), 422, 'Unsupported house status.');

        return $this->manage($actor, $farmId, function ($current, $farm) use ($houseId, $status) {
            $house = DB::table('poultry_houses')->where('farm_id', $farm->id)->where('id', $houseId)->lockForUpdate()->first();
            abort_unless($house, 404);
            if ($house->status === $status) {
                return ['house' => $this->summary($house), 'replayed' => true];
            }
            abort_if(DB::table('sensors')->where('poultry_house_id', $houseId)->exists(), 422,
                'Explicitly unassign every Active and Inactive device before changing this house status. No devices were unassigned.');
            $updates = ['status' => $status, 'updated_at' => now(), $status === 'Inactive' ? 'deactivated_at' : 'reactivated_at' => now()];
            DB::table('poultry_houses')->where('id', $houseId)->update($updates);
            $this->audit($current, $status === 'Inactive' ? 'Deactivated Poultry House' : 'Reactivated Poultry House', $farm,
                'House '.$house->house_number.' (#'.$houseId.') is '.$status.'; no device assignments changed');

            return ['house' => $this->summary(DB::table('poultry_houses')->where('id', $houseId)->first()), 'replayed' => false];
        });
    }

    private function audit(User $actor, string $action, Farm $farm, string $details): void
    {
        ActivityLog::create(['user_id' => $actor->id, 'role' => $actor->role, 'action' => $action,
            'details' => $farm->farm_name.' (#'.$farm->id.'): '.$details, 'type' => 'Farm']);
    }
}
