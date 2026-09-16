<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * Lists user accounts whose mobile numbers collide once formatting is
 * stripped (e.g. "0992 772 4857" vs "09927724857"). These violate the
 * one-number-per-account rule but are deliberately NOT auto-fixed — the
 * normalize migration leaves them untouched — because deciding which
 * account to keep, merge or re-number is a manual call.
 *
 *   php artisan users:mobile-conflicts
 */
class ReportMobileNumberConflicts extends Command
{
    protected $signature = 'users:mobile-conflicts';

    protected $description = 'Report user accounts that share the same mobile number after normalization';

    public function handle(): int
    {
        $groups = User::query()
            ->whereNotNull('mobile_number')
            ->orderBy('id')
            ->get(['id', 'first_name', 'last_name', 'email', 'role', 'status', 'mobile_number'])
            ->groupBy(fn (User $u) => User::normalizeMobileNumber($u->mobile_number))
            ->filter(fn ($users) => $users->count() > 1);

        if ($groups->isEmpty()) {
            $this->info('No mobile number conflicts found.');
            return self::SUCCESS;
        }

        $this->warn("{$groups->count()} mobile number(s) are shared by more than one account:");

        foreach ($groups as $normalized => $users) {
            $this->newLine();
            $this->line("Normalized number: {$normalized}");
            $this->table(
                ['User ID', 'Name', 'Role', 'Status', 'Email', 'Stored mobile_number'],
                $users->map(fn (User $u) => [
                    $u->id,
                    $u->full_name,
                    $u->role,
                    $u->status,
                    $u->email ?? '—',
                    $u->getRawOriginal('mobile_number'),
                ])->all()
            );
        }

        $this->newLine();
        $this->line('Resolve each group manually (re-number or retire one account). Saving a');
        $this->line('user through the app normalizes its stored number automatically.');

        return self::FAILURE;
    }
}
