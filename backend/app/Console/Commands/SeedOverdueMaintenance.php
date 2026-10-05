<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\MaintenanceNotification;
use App\Services\MaintenanceStatusService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Fill the Overdue Maintenance screen out to a target number of farms.
 *
 * WHY REGISTRATION IS BACKDATED RATHER THAN A CLEAN-OUT INVENTED
 * MaintenanceStatusService counts from the farm's last 'Full Manure Clean-out',
 * or from farms.created_at when none was ever logged, so Overdue and
 * Non-Compliant are derived and there is no status row to write. This is the
 * same approach SeedBarangayFarms takes for its nine picks, and for the same
 * reason: maintenance_logs.photo_path is NOT NULL by design ("required - no
 * photo, no log"), so a seeded clean-out would carry a made-up path that
 * renders as a broken image and claims photographic proof that does not exist.
 * Backdating states only what is true - this farm has been on the books a long
 * time and has never logged a clean-out - and the screen prints exactly that:
 * "Never logged".
 *
 * WHY IT IS NOT A MIGRATION
 * A migration runs against every database, including a fresh one and the test
 * suite, where these farm ids do not exist and there is no roster to pick from.
 * This is demo data for one specific database, so it is a command that is run
 * deliberately, once, and recorded in the Activity Log.
 *
 * WHAT ELSE IT HAS TO MOVE
 * farms.created_at is what the UI labels "Date Registered" and what the
 * Maintenance details modal prints beside the compliance status, so three other
 * records have to agree with it or the date contradicts itself:
 *
 *   - users.created_at - the owner account is created in the same transaction
 *     as the farm by FarmController@store. A farm cannot be registered in 2025
 *     by an account that did not exist until 2026.
 *   - the activity_logs entry that announced the registration.
 *   - maintenance_notifications - without a row there, a farm 199 days past its
 *     grace period shows an empty notification history, contradicting the
 *     system's own claim that it notifies once per cycle. That row is also what
 *     stops CheckMaintenanceCompliance, which runs dailyAt('08:00') and would
 *     otherwise send a REAL SMS through UniSMS to every one of these farms -
 *     seeded numbers, not real owners', so a hundred strangers would be
 *     messaged at cost - and bury every admin's notification bell.
 *
 * Dry run by default. Re-running is safe: the picks are deterministic, the
 * dates are recomputed to the same values, and the notification rows are
 * guarded by their unique key.
 */
class SeedOverdueMaintenance extends Command
{
    protected $signature = 'maintenance:seed-overdue
                            {--target=100 : How many active farms should end up Overdue or Non-Compliant}
                            {--force : Actually write. Without it this is a dry run}';

    protected $description = 'Backdate farm registrations so the Overdue Maintenance screen shows a target number of farms';

    /**
     * Farms that must never be backdated.
     *
     * Gly's Farm and GEO'S FARM are the live demo farms the real device
     * rotates between. Their readings are the only non-mock data in the
     * system, so they stay compliant and keep telling the truth.
     */
    private const PROTECTED_FARM_IDS = [3463, 3763];

    /**
     * Farms that must be included if they are not already overdue.
     *
     * Joana's Farm is the one walked through by hand during the defence.
     */
    private const REQUIRED_FARM_IDS = [3462];

    /**
     * How far past the due date an Overdue pick is placed.
     *
     * Capped below the 30-day grace period with room to spare, so a farm shown
     * as Overdue does not quietly turn Non-Compliant in the days before the
     * demo. Cycled rather than fixed so the days_overdue column reads like real
     * farms rather than one number repeated.
     */
    private const OVERDUE_DAYS_PAST_DUE = [2, 5, 8, 11, 14, 17, 20];

    /**
     * How far past the END of the grace period a Non-Compliant pick is placed.
     */
    private const NON_COMPLIANT_DAYS_PAST_GRACE = [40, 61, 84, 103, 126, 149, 171, 194];

    public function handle(MaintenanceStatusService $status): int
    {
        $target = (int) $this->option('target');
        $write = (bool) $this->option('force');
        $today = Carbon::now();

        $farms = Farm::where('status', 'Active')->with('latestCleanout')->get();

        $already = $farms->filter(
            fn (Farm $f) => in_array($status->getStatus($f)['status'], ['Overdue', 'Non-Compliant'], true)
        );

        $need = $target - $already->count();

        $this->line(sprintf(
            'Active farms: %d.  Already Overdue/Non-Compliant: %d.  Target: %d.',
            $farms->count(),
            $already->count(),
            $target
        ));

        if ($need <= 0) {
            $this->info('Target already met — no farm needs backdating.');
            $this->newLine();
        }

        // Eligible: compliant today, never logged a clean-out (a farm with one
        // anchors on that log, so moving its registration would not move its
        // status), and not protected.
        $eligible = $farms
            ->reject(fn (Farm $f) => $already->contains('id', $f->id))
            ->reject(fn (Farm $f) => in_array($f->id, self::PROTECTED_FARM_IDS, true))
            ->reject(fn (Farm $f) => $f->latestCleanout !== null)
            // Required ids first, then hashed so the same farms come up on
            // every run and a walkthrough can be rehearsed.
            ->sortBy(fn (Farm $f) => [
                in_array($f->id, self::REQUIRED_FARM_IDS, true) ? 0 : 1,
                ($f->id * 7919) % 1009,
                $f->id,
            ])
            ->values();

        if ($need > $eligible->count()) {
            $this->warn(sprintf(
                'Only %d farms are eligible but %d are needed. Backdating all %d; the screen will show %d, not %d.',
                $eligible->count(),
                $need,
                $eligible->count(),
                $already->count() + $eligible->count(),
                $target
            ));
        }

        $picks = $eligible->take(max($need, 0));

        // Alternate the two phases so both are visible on the screen at once
        // rather than a hundred farms all in the same state.
        $plan = $picks->values()->map(function (Farm $farm, int $i) use ($status, $today) {
            $interval = $status->intervalDaysFor($farm->farm_size);
            $grace = $status->gracePeriodDays();
            $overdue = $i % 2 === 0;

            $daysBack = $overdue
                ? $interval + self::OVERDUE_DAYS_PAST_DUE[intdiv($i, 2) % count(self::OVERDUE_DAYS_PAST_DUE)]
                : $interval + $grace + self::NON_COMPLIANT_DAYS_PAST_GRACE[intdiv($i, 2) % count(self::NON_COMPLIANT_DAYS_PAST_GRACE)];

            // The original clock time is kept so the dates still read like real
            // registrations rather than a batch written at midnight.
            $registeredAt = $today->copy()
                ->subDays($daysBack)
                ->setTimeFrom($farm->created_at ?? $today);

            return [
                'farm' => $farm,
                'phase' => $overdue ? 'Overdue' : 'Non-Compliant',
                'registered_at' => $registeredAt,
            ];
        });

        $this->newLine();
        $this->line(sprintf('%-6s %-40s %-7s %-14s %s', 'ID', 'FARM', 'SIZE', 'PHASE', 'REGISTERED'));
        $this->line(str_repeat('-', 94));

        foreach ($plan as $row) {
            $this->line(sprintf(
                '%-6s %-40s %-7s %-14s %s',
                $row['farm']->id,
                mb_strimwidth((string) $row['farm']->farm_name, 0, 40, '…'),
                $row['farm']->farm_size,
                $row['phase'],
                $row['registered_at']->format('M d, Y H:i')
            ));
        }

        $this->newLine();

        if (! $write) {
            $this->warn('Dry run. Nothing was written. Re-run with --force to apply.');

            return self::SUCCESS;
        }

        $counts = ['farms' => 0, 'owners' => 0, 'logs' => 0, 'notices' => 0];

        DB::transaction(function () use ($plan, $status, $today, &$counts) {
            foreach ($plan as $row) {
                // saveQuietly + forceFill: created_at is guarded, and nothing
                // should observe a registration that is being corrected.
                $row['farm']->forceFill(['created_at' => $row['registered_at']])->saveQuietly();
                $counts['farms']++;
            }

            // Everything from here on runs over EVERY farm now in one of the two
            // phases, not just this run's picks, so the nine SeedBarangayFarms
            // backdated earlier - which carry the same mismatches - are repaired
            // too.
            $targets = Farm::where('status', 'Active')
                ->with(['latestCleanout', 'user'])
                ->get()
                ->filter(fn (Farm $f) => in_array($status->getStatus($f)['status'], ['Overdue', 'Non-Compliant'], true));

            foreach ($targets as $farm) {
                $counts['owners'] += $this->alignOwnerAccount($farm);
                $counts['logs'] += $this->alignRegistrationLog($farm);
                $counts['notices'] += $this->backfillNotifications($farm, $status, $today);
            }

            ActivityLog::create([
                'user_id' => null,
                'role' => 'system',
                'action' => 'Seeded Overdue Maintenance Data',
                'details' => sprintf(
                    '%d farm registration(s) backdated; %d owner account(s), %d registration log entr(ies) and %d notification record(s) aligned to match. %d farms now Overdue or Non-Compliant. No SMS sent.',
                    $counts['farms'],
                    $counts['owners'],
                    $counts['logs'],
                    $counts['notices'],
                    $targets->count()
                ),
                'type' => 'Farm',
            ]);
        });

        $this->info(sprintf(
            'Done. %d farm(s) backdated, %d owner account(s), %d log entr(ies), %d notification record(s). No SMS sent.',
            $counts['farms'],
            $counts['owners'],
            $counts['logs'],
            $counts['notices']
        ));

        return self::SUCCESS;
    }

    /**
     * Move the owner account back to just before its farm.
     *
     * Only owners holding exactly one farm are touched: an owner with several
     * has no single registration date to follow. updated_at is deliberately
     * left where it is — an account opened in 2025 and last edited in 2026 is
     * the truth.
     */
    private function alignOwnerAccount(Farm $farm): int
    {
        $owner = $farm->user;

        if (! $owner || $owner->role !== 'farm_owner') {
            return 0;
        }

        if (Farm::where('user_id', $owner->id)->count() !== 1) {
            return 0;
        }

        $target = Carbon::parse($farm->created_at)->subMinute();

        if ($owner->created_at && $owner->created_at->equalTo($target)) {
            return 0;
        }

        $owner->forceFill(['created_at' => $target])->saveQuietly();

        return 1;
    }

    /**
     * Redate the Activity Log entry that announced this registration.
     *
     * FarmController@store writes details as "{farm_name} — {first} {last}",
     * and farms.owner_name holds that same "{first} {last}", so both are
     * matched. Farm name alone would be ambiguous — the roster has several
     * farms sharing a name (two ALLAN MAKALINTAL, two OSCAR ATIENZA, and
     * others) — and would redate the wrong entry.
     */
    private function alignRegistrationLog(Farm $farm): int
    {
        $prefix = $farm->farm_name.' — '.$farm->owner_name;

        return ActivityLog::where('type', 'Farm')
            ->whereIn('action', ['Created Farm Owner Account', 'Added Farm to Existing Owner'])
            ->where(function ($q) use ($prefix) {
                $q->where('details', $prefix)
                    ->orWhere('details', 'like', $prefix.' —%');
            })
            ->whereDate('created_at', '>', $farm->created_at)
            ->update([
                'created_at' => $farm->created_at,
                'updated_at' => $farm->created_at,
            ]);
    }

    /**
     * Write the notification trail this farm must have.
     *
     * sent_at is 08:00 on the day the status actually changed — the hour the
     * scheduled job runs — not today, because that is when the notice would
     * have gone out.
     *
     * sms_log_id stays null on purpose. No SMS was ever sent for these, so
     * there is no delivery record to point at, and inventing an sms_logs row
     * would claim a message reached a farmer who never got one. The details
     * modal therefore prints the delivery status as "Unknown", which is
     * exactly the truth.
     *
     * The `notifications` table is deliberately NOT backfilled. It is a live
     * inbox, not an audit trail: a hundred historical unread notices would bury
     * the admin bell, and nothing reads it to establish what happened.
     */
    private function backfillNotifications(Farm $farm, MaintenanceStatusService $status, Carbon $today): int
    {
        $state = $status->getStatus($farm);
        $anchor = Carbon::parse($state['anchor_date']);
        $due = $anchor->copy()->addDays($status->intervalDaysFor($farm->farm_size));
        $grace = $due->copy()->addDays($status->gracePeriodDays());

        // Every farm in either phase passed through the grace window, so the
        // reminder always belongs; the notice only once the grace period ended.
        $events = [['overdue_reminder', $due]];

        if ($today->greaterThanOrEqualTo($grace)) {
            $events[] = ['non_compliant_notice', $grace];
        }

        $written = 0;

        foreach ($events as [$event, $when]) {
            $exists = MaintenanceNotification::where('farm_id', $farm->id)
                ->where('event', $event)
                ->whereDate('anchor_date', $anchor)
                ->exists();

            if ($exists) {
                continue;
            }

            $sentAt = $when->copy()->setTime(8, 0);

            MaintenanceNotification::create([
                'farm_id' => $farm->id,
                'event' => $event,
                'anchor_date' => $anchor,
                'sms_log_id' => null,
                'sent_at' => $sentAt,
            ]);

            $written++;
        }

        return $written;
    }
}
