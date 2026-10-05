<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-off cleanup for farm owner accounts left behind by farm deletions that
 * happened BEFORE the owner lifecycle rule existed.
 *
 * SuperAdmin\FarmDeletionController@destroy now deletes the owner when their
 * last farm goes. Deletions made before that shipped removed only the farm, so
 * their owners are still in `users` with zero farms — able to sign in and land
 * on an empty dashboard. This removes exactly those rows and nothing else.
 *
 * Reports by default and changes nothing. --force is required to delete, so an
 * accidental run can only ever produce a list.
 */
class PruneOrphanFarmOwners extends Command
{
    protected $signature = 'farms:prune-orphan-owners {--force : Actually delete the accounts listed}';

    protected $description = 'List (or with --force, delete) farm owner accounts that no longer have any farm';

    public function handle(): int
    {
        // Scoped three ways on purpose: the role must be farm_owner, the farm
        // count must be exactly zero, and the count is taken live rather than
        // from any cached column.
        $orphans = User::where('role', 'farm_owner')
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('farms')
                    ->whereColumn('farms.user_id', 'users.id');
            })
            ->orderBy('id')
            ->get();

        if ($orphans->isEmpty()) {
            $this->info('No orphaned farm owner accounts found. Nothing to do.');

            return self::SUCCESS;
        }

        $this->warn($orphans->count().' farm owner account(s) have no farm:');
        $this->newLine();

        $this->table(
            ['ID', 'Name', 'Mobile', 'Email', 'Status', 'Registered'],
            $orphans->map(fn ($u) => [
                $u->id,
                trim($u->first_name.' '.$u->last_name),
                $u->mobile_number ?: '—',
                $u->email ?: '—',
                $u->status,
                $u->created_at?->toDateString() ?? '—',
            ])->all()
        );

        if (! $this->option('force')) {
            $this->newLine();
            $this->line('Nothing was changed. Re-run with --force to delete these accounts.');

            return self::SUCCESS;
        }

        // Double-checked inside the transaction: a farm could in principle be
        // created for one of these owners between the listing above and here.
        $deleted = [];

        DB::transaction(function () use ($orphans, &$deleted) {
            foreach ($orphans as $owner) {
                if (Farm::where('user_id', $owner->id)->exists()) {
                    continue;
                }

                $label = trim($owner->first_name.' '.$owner->last_name)." (id {$owner->id})";

                // Sanctum's tokens have no foreign key to users, so they would
                // outlive the row otherwise.
                $owner->tokens()->delete();
                $owner->delete();

                $deleted[] = $label;
            }

            if ($deleted !== []) {
                // Recorded so the removal is accounted for rather than simply
                // happening — these were real accounts.
                ActivityLog::create([
                    'user_id' => null,
                    'role'    => 'system',
                    'action'  => 'Pruned Orphaned Farm Owner Accounts',
                    'details' => 'Removed '.count($deleted).' farm owner account(s) left with no farm: '
                        .implode(', ', $deleted),
                    'type'    => 'Account',
                ]);
            }
        });

        $this->newLine();
        $this->info(count($deleted).' account(s) deleted.');

        foreach ($deleted as $label) {
            $this->line('  - '.$label);
        }

        return self::SUCCESS;
    }
}
