<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\Sensor;
use App\Models\User;
use App\Support\DummyHouseInventory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Explicit approved-manifest operation only; no route, scheduler, seeder or automatic discovery. */
final class DummyFarmInitializationService
{
    public static function digest(array $value): string
    {
        $sort = function (array $value) use (&$sort): array {
            if (! array_is_list($value)) {
                ksort($value);
            }
            foreach ($value as &$item) {
                if (is_array($item)) {
                    $item = $sort($item);
                }
            }

            return $value;
        };

        return hash('sha256', json_encode($sort($value), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
    }

    /** Explicit target read for a future approved manifest author, not an operational command. */
    public function target(): string
    {
        $server = DB::selectOne('SELECT VERSION() AS version,DATABASE() AS db,@@hostname AS host,@@port AS port,@@server_id AS server_id', [], false);

        return self::digest((array) $server);
    }

    public function baseline(Farm $farm): string
    {
        return self::digest(array_diff_key($farm->getRawOriginal(), array_flip(['last_house_number', 'house_inventory_verified_at'])));
    }

    private function actor(User $actor, bool $lock = false): User
    {
        $query = User::whereKey($actor->id);
        $current = ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
        abort_unless($current->role === 'super_admin' && $current->status === 'active', 403);

        return $current;
    }

    private function validate(User $actor, array $manifest, string $approvedHash): void
    {
        $this->actor($actor);
        abort_unless(preg_match('/\A[a-f0-9]{64}\z/D', $approvedHash) && hash_equals($approvedHash, self::digest($manifest)), 422, 'The manifest does not match the separately approved SHA-256.');
        $keys = ['version', 'purpose', 'physical_inventory_verified', 'operation_id', 'approval_reference', 'approved_by', 'target_sha256', 'farms'];
        abort_unless(count($manifest) === count($keys) && ! array_diff($keys, array_keys($manifest))
            && $manifest['version'] === 1 && $manifest['purpose'] === 'dummy_data_assumption'
            && $manifest['physical_inventory_verified'] === false && is_string($manifest['operation_id']) && Str::isUuid($manifest['operation_id'])
            && is_string($manifest['approval_reference']) && trim($manifest['approval_reference']) !== '' && strlen($manifest['approval_reference']) <= 120
            && $manifest['approved_by'] === $actor->id && is_string($manifest['target_sha256'])
            && is_array($manifest['farms']) && array_is_list($manifest['farms']) && count($manifest['farms']) >= 1 && count($manifest['farms']) <= 1000, 422, 'Invalid dummy-data manifest.');
        $ids = [];
        foreach ($manifest['farms'] as $entry) {
            abort_unless(is_array($entry) && count($entry) === 5 && ! array_diff(['farm_id', 'owner_id', 'baseline_sha256', 'house_count', 'house_status'], array_keys($entry))
                && is_int($entry['farm_id']) && $entry['farm_id'] > 0 && is_int($entry['owner_id']) && $entry['owner_id'] > 0
                && is_string($entry['baseline_sha256']) && preg_match('/\A[a-f0-9]{64}\z/D', $entry['baseline_sha256'])
                && $entry['house_count'] === 1 && $entry['house_status'] === 'Active' && ! in_array($entry['farm_id'], $ids, true), 422, 'Invalid or duplicate farm entry.');
            $ids[] = $entry['farm_id'];
        }
        abort_unless(app(PoultryHouseFoundationReadiness::class)->inspect()['ready'], 503, 'The complete compatible foundation is required.');
        abort_unless(hash_equals($this->target(), $manifest['target_sha256']), 409, 'The manifest targets a different database/server.');
        abort_if(DB::transactionLevel() !== 0, 409, 'Run this operation outside any caller transaction.');
    }

    private function classify(?Farm $farm, array $entry, array $manifest, string $hash): array
    {
        $out = ['farm_id' => $entry['farm_id'], 'classification' => 'excluded', 'reason' => 'farm_missing', 'expected_changes' => $this->changes(false)];
        if (! $farm) {
            return $out;
        }
        if ((int) $farm->user_id !== $entry['owner_id']) {
            return array_replace($out, ['reason' => 'owner_changed']);
        }
        $ledger = DB::table('poultry_house_initializations')->where('farm_id', $farm->id)->first();
        $houses = DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('house_number')->get();
        if ($ledger && $ledger->operation_id === $manifest['operation_id'] && $ledger->manifest_sha256 === $hash
            && $ledger->verification_reference === DummyHouseInventory::PREFIX.self::digest($entry)
            && (int) $ledger->verified_by === $manifest['approved_by'] && DummyHouseInventory::approved($farm, $ledger)
            && (int) $farm->last_house_number >= (int) $houses->max('house_number')) {
            return array_replace($out, ['classification' => 'already_initialized', 'reason' => 'exact_completed_manifest', 'expected_changes' => $this->changes(false)]);
        }
        if ($ledger || $houses->isNotEmpty() || (int) $farm->last_house_number !== 0 || $farm->house_inventory_verified_at !== null) {
            return array_replace($out, ['reason' => 'existing_or_partial_inventory']);
        }
        if ($farm->status !== 'Active') {
            return array_replace($out, ['reason' => 'farm_not_active']);
        }
        if (! hash_equals($entry['baseline_sha256'], $this->baseline($farm))) {
            return array_replace($out, ['reason' => 'baseline_changed']);
        }

        return array_replace($out, ['classification' => 'eligible', 'reason' => 'approved_dummy_assumption', 'expected_changes' => $this->changes(true)]);
    }

    private function changes(bool $create): array
    {
        return ['houses_inserted' => (int) $create, 'initializations_inserted' => (int) $create, 'audit_rows_inserted' => (int) $create,
            'counter' => $create ? ['from' => 0, 'to' => 1] : 'unchanged', 'house' => $create ? ['number' => 1, 'name' => 'House 1', 'status' => 'Active'] : 'unchanged',
            'physical_verification_timestamp' => $create ? null : 'unchanged', 'device_updates' => 0, 'history_updates' => 0];
    }

    private function plan(array $manifest, string $hash, bool $lock): array
    {
        $entries = collect($manifest['farms'])->sortBy('farm_id')->values();
        $farms = Farm::whereIn('id', $entries->pluck('farm_id'))->orderBy('id');
        $farms = ($lock ? $farms->lockForUpdate() : $farms->useWritePdo())->get()->keyBy('id');
        $rows = $entries->map(fn ($entry) => $this->classify($farms->get($entry['farm_id']), $entry, $manifest, $hash))->all();
        $canApply = ! in_array('excluded', array_column($rows, 'classification'), true);
        $count = $canApply ? count(array_filter($rows, fn ($r) => $r['classification'] === 'eligible')) : 0;
        if (! $canApply) {
            $rows = array_map(fn ($row) => array_replace($row, ['expected_changes' => $this->changes(false)]), $rows);
        }

        return ['manifest_sha256' => $hash, 'physical_inventory_verified' => false, 'can_apply' => $canApply,
            'farms' => $rows, 'outside_manifest' => 'Not selected or read; never initialized by this operation.',
            'totals' => ['houses_inserted' => $count, 'initializations_inserted' => $count, 'audit_rows_inserted' => $count,
                'farm_counters_updated' => $count, 'device_updates' => 0, 'history_updates' => 0, 'physical_verifications_written' => 0]];
    }

    /** Read-only application transaction; no farms outside the manifest are enumerated. */
    public function preview(User $actor, array $manifest, string $approvedHash): array
    {
        $this->validate($actor, $manifest, $approvedHash);

        return DB::transaction(fn () => $this->plan($manifest, $approvedHash, false));
    }

    /** One bounded all-or-nothing DML transaction; exact completed retries are no-ops. */
    public function apply(User $actor, array $manifest, string $approvedHash): array
    {
        $this->validate($actor, $manifest, $approvedHash);

        return DB::transaction(function () use ($actor, $manifest, $approvedHash) {
            // Match registration/house/deletion's existing device-first barrier, then sorted farms, then actor.
            Sensor::orderBy('id')->lockForUpdate()->get(['id']);
            $plan = $this->plan($manifest, $approvedHash, true);
            $current = $this->actor($actor, true);
            abort_unless($plan['can_apply'], 409, 'The manifest contains excluded or changed farms. Nothing was initialized.');
            foreach ($plan['farms'] as $row) {
                if ($row['classification'] !== 'eligible') {
                    continue;
                }
                $entry = collect($manifest['farms'])->firstWhere('farm_id', $row['farm_id']);
                $at = now();
                DB::table('poultry_houses')->insert(['farm_id' => $row['farm_id'], 'house_number' => 1, 'status' => 'Active',
                    'creation_request_id' => $manifest['operation_id'], 'created_at' => $at, 'updated_at' => $at]);
                DB::table('poultry_house_initializations')->insert(['farm_id' => $row['farm_id'], 'operation_id' => $manifest['operation_id'],
                    'source' => 'verified_population', 'initial_house_count' => 1, 'verification_reference' => DummyHouseInventory::PREFIX.self::digest($entry),
                    'manifest_sha256' => $approvedHash, 'verified_by' => $current->id, 'verifier_role' => $current->role, 'completed_at' => $at]);
                // Preserve every old farm field, including updated_at. This is not physical verification.
                DB::table('farms')->where('id', $row['farm_id'])->update(['last_house_number' => 1]);
                ActivityLog::create(['user_id' => $current->id, 'role' => $current->role, 'type' => 'Farm', 'action' => 'Initialized Dummy House Inventory',
                    'details' => json_encode(['farm_id' => $row['farm_id'], 'operation_id' => $manifest['operation_id'], 'approval_reference' => $manifest['approval_reference'],
                        'manifest_sha256' => $approvedHash, 'assumption' => 'One initial Active House 1 for dummy data only; not physically verified.'], JSON_THROW_ON_ERROR)]);
            }

            return $plan;
        }, 3);
    }
}
