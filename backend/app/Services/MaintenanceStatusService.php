<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\MaintenanceLog;
use Carbon\Carbon;

class MaintenanceStatusService
{
    private const INTERVAL_DAYS = [
        'Small'  => 365,
        'Medium' => 270,
        'Large'  => 180,
    ];

    private const GRACE_PERIOD_DAYS = 30;

    /**
     * @param  Carbon|null  $asOf  Evaluate the farm's status at this instant
     *   rather than right now, so a historical monthly report can state the
     *   compliance position at the end of its own period instead of today's.
     *   Passing it also restricts the clean-out lookup to logs on or before
     *   that cutoff: a clean-out performed in October must not make a farm
     *   look compliant in a September report. The interval and grace-period
     *   rules themselves are unchanged, and omitting the argument reproduces
     *   the previous behaviour exactly for all existing callers.
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

        $intervalDays = self::INTERVAL_DAYS[$farm->farm_size] ?? self::INTERVAL_DAYS['Medium'];
        $dueDate      = $anchorDate->copy()->addDays($intervalDays);
        $overdueDate  = $dueDate->copy()->addDays(self::GRACE_PERIOD_DAYS);

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
            'Overdue'       => (int) round($dueDate->diffInDays($today)),
            'Non-Compliant' => (int) round($overdueDate->diffInDays($today)),
            default         => 0,
        };

        return [
            'status'                 => $status,
            'last_performed_at'      => $lastLog?->performed_at?->format('M d, Y'),
            'days_since'             => (int) round($anchorDate->diffInDays($today)),
            'expected_interval_days' => $intervalDays,
            'days_overdue'           => $daysOverdue,
            'anchor_date'            => $anchorDate->toDateString(),
            'due_date'               => $dueDate->format('M d, Y'),
            'grace_end_date'         => $overdueDate->format('M d, Y'),
        ];
    }
}