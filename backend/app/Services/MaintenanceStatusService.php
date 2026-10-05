<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\MaintenanceLog;
use Carbon\Carbon;

class MaintenanceStatusService
{
    /**
     * How long a farm of each size may go between full manure clean-outs.
     *
     * WHERE THESE NUMBERS COME FROM
     * Field interviews conducted for this study with poultry farms in San
     * Jose, Batangas. Both halves of the rule were taken from the same
     * source: Small / Medium / Large is how the farms themselves describe
     * their scale, and the intervals are the clean-out frequency reported
     * for each. They are not a default, an industry constant, or a figure
     * assumed by this codebase.
     *
     * The direction follows from how the farms operate: a larger house
     * holds more birds, manure accumulates faster, and the clean-out comes
     * round sooner. Hence Large is the SHORTEST interval, not the longest —
     * which reads backwards until the reason is stated.
     *
     * This is the one definition of the rule in the system. Changing a
     * number here moves every due date, every Overdue and Non-Compliant
     * status, the Overdue Maintenance screen, the compliance figures in
     * every report generated afterwards, and the SMS the daily compliance
     * check sends — so it should not be edited without a source to cite for
     * the new value.
     */
    private const INTERVAL_DAYS = [
        'Small' => 365,
        'Medium' => 270,
        'Large' => 180,
    ];

    /**
     * The window between a clean-out falling due and the farm being counted
     * as Non-Compliant.
     *
     * A farm past its due date is Overdue, not yet in breach: it is sent a
     * reminder and given these days to comply. Only once they run out does
     * it become Non-Compliant, which carries the escalated notice and
     * reaches the Super Admin's system-wide view. The two stages exist so
     * that being a few days late is not recorded as the same thing as
     * ignoring the requirement.
     */
    private const GRACE_PERIOD_DAYS = 30;

    /**
     * @param  Carbon|null  $asOf  Evaluate the farm's status at this instant
     *                             rather than right now, so a historical monthly report can state the
     *                             compliance position at the end of its own period instead of today's.
     *                             Passing it also restricts the clean-out lookup to logs on or before
     *                             that cutoff: a clean-out performed in October must not make a farm
     *                             look compliant in a September report. The interval and grace-period
     *                             rules themselves are unchanged, and omitting the argument reproduces
     *                             the previous behaviour exactly for all existing callers.
     */
    public function getStatus(Farm $farm, ?Carbon $asOf = null): array
    {
        if ($asOf === null) {
            // Callers iterating many farms eager-load latestCleanout so this is
            // one query in total rather than one per farm.
            $lastLog = $farm->relationLoaded('latestCleanout')
                ? $farm->latestCleanout
                : MaintenanceLog::where('farm_id', $farm->id)
                    ->where('maintenance_type', 'Full Manure Clean-out')
                    ->latest('performed_at')
                    ->first();
        } else {
            // The eager-loaded relation is deliberately not reused here: it holds
            // the newest clean-out overall, which may post-date the cutoff.
            $lastLog = MaintenanceLog::where('farm_id', $farm->id)
                ->where('maintenance_type', 'Full Manure Clean-out')
                ->where('performed_at', '<=', $asOf)
                ->latest('performed_at')
                ->first();
        }

        $anchorDate = $lastLog
            ? Carbon::parse($lastLog->performed_at)
            : Carbon::parse($farm->created_at);

        $intervalDays = $this->intervalDaysFor($farm->farm_size);
        $dueDate = $anchorDate->copy()->addDays($intervalDays);
        $overdueDate = $dueDate->copy()->addDays(self::GRACE_PERIOD_DAYS);

        $today = $asOf ? $asOf->copy() : Carbon::now();

        if ($today->lessThan($dueDate)) {
            $status = 'Compliant';
        } elseif ($today->lessThan($overdueDate)) {
            $status = 'Overdue';
        } else {
            $status = 'Non-Compliant';
        }

        // Fixed: previously only Non-Compliant ever got a real number here —
        // Overdue farms always showed 0 regardless of how far into the grace
        // period they actually were. Now both phases compute a real value:
        // Overdue = days since the due date (0-29, inside the grace window),
        // Non-Compliant = days since the grace period itself ended.
        $daysOverdue = match ($status) {
            'Overdue' => (int) round($dueDate->diffInDays($today)),
            'Non-Compliant' => (int) round($overdueDate->diffInDays($today)),
            default => 0,
        };

        return [
            'status' => $status,
            'last_performed_at' => $lastLog?->performed_at?->format('M d, Y'),
            'days_since' => (int) round($anchorDate->diffInDays($today)),
            'expected_interval_days' => $intervalDays,
            'days_overdue' => $daysOverdue,
            'anchor_date' => $anchorDate->toDateString(),
            'due_date' => $dueDate->format('M d, Y'),
            'grace_end_date' => $overdueDate->format('M d, Y'),
        ];
    }

    /**
     * The clean-out interval for a farm size, in days.
     *
     * Public because more than one caller needs it: the seeding commands have
     * to work out what registration date puts a farm in a given phase, and
     * they were each carrying their own copy of these three numbers. Three
     * copies of a rule is three places to miss when it changes, so the rule
     * lives here, next to the grace period and the comparison that uses it.
     */
    public function intervalDaysFor(?string $farmSize): int
    {
        return self::INTERVAL_DAYS[$farmSize] ?? self::INTERVAL_DAYS['Medium'];
    }

    /** The grace period after the due date, in days. */
    public function gracePeriodDays(): int
    {
        return self::GRACE_PERIOD_DAYS;
    }
}
