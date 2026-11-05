<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PruneOrphanFarmOwners extends Command
{
    protected $signature = 'farms:prune-orphan-owners {--force : Actually delete the accounts listed}';

    protected $description = 'List (or with --force, delete) farm owner accounts that no longer have any farm';

    public function handle(): int
    {
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

                $owner->tokens()->delete();
                $owner->delete();

                $deleted[] = $label;
            }

            if ($deleted !== []) {

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
