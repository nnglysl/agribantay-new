<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\MaintenanceLog;
use Carbon\Carbon;

/**
 * Objective 3.2 — Maintenance Status Tracking.
 *
 * Status names now match the LGU compliance workflow directly:
 *   Scheduled     — within the expected interval (was "Up to date")
 *   Overdue       — past due, still inside the 30-day grace period (was "Due")
 *   Non-Compliant — past the 30-day grace period entirely (was "Overdue")
 *
 * "Compliant" from the spec is intentionally NOT a persisted/computed
 * state here — it's the one-time confirmation shown right when a farmer
 * successfully logs a clean-out (see Farmer\MaintenanceController::store).
 * The instant after logging, the real anchor date resets to today, which
 * always computes to "Scheduled" — there's no separate ongoing state to
 * track beyond that.
 */
class MaintenanceStatusService
{
    private const INTERVAL_DAYS = [
        'Small'  => 365,
        'Medium' => 270,
        'Large'  => 180,
    ];

    private const GRACE_PERIOD_DAYS = 30;

    public function getStatus(Farm $farm): array
    {
        $lastLog = MaintenanceLog::where('farm_id', $farm->id)
            ->where('maintenance_type', 'Full Manure Clean-out')
            ->latest('performed_at')
            ->first();

        $anchorDate = $lastLog
            ? Carbon::parse($lastLog->performed_at)
            : Carbon::parse($farm->created_at);

        $intervalDays = self::INTERVAL_DAYS[$farm->farm_size] ?? self::INTERVAL_DAYS['Medium'];
        $dueDate      = $anchorDate->copy()->addDays($intervalDays);
        $overdueDate  = $dueDate->copy()->addDays(self::GRACE_PERIOD_DAYS);

        $today = Carbon::now();

        if ($today->lessThan($dueDate)) {
            $status = 'Scheduled';
        } elseif ($today->lessThan($overdueDate)) {
            $status = 'Overdue';
        } else {
            $status = 'Non-Compliant';
        }

        return [
            'status'                 => $status,
            'last_performed_at'      => $lastLog?->performed_at?->format('M d, Y'),
            'days_since'             => (int) round($anchorDate->diffInDays($today)),
            'expected_interval_days' => $intervalDays,
            'days_overdue'           => $status === 'Non-Compliant' ? (int) round($overdueDate->diffInDays($today)) : 0,
            // Exposed so callers (the compliance command, the admin
            // report) can dedupe/reference the exact clean-out cycle
            // this status was computed from, without recomputing it.
            'anchor_date'            => $anchorDate->toDateString(),
        ];
    }
}