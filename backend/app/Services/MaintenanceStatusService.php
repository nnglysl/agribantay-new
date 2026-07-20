<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\MaintenanceLog;
use Carbon\Carbon;

/**
 * Objective 3.2 — Maintenance Status Tracking.
 *
 * Nothing here is stored directly as a "status" — it's always computed
 * fresh from the farm's most recent Full Manure Clean-out log (or, if
 * none exists yet, from the farm's registration date) compared against
 * today. Same "calculate, don't store" pattern as TrendAnalysisService
 * and every other status in this app.
 *
 * Expected interval between clean-outs scales with farm size, since
 * larger farms accumulate manure faster:
 *
 *   Small farm  -> ~12 months (365 days)
 *   Medium farm -> ~9 months  (270 days)
 *   Large farm  -> ~6 months  (180 days)
 *
 * Once that interval passes, a farm isn't immediately "Overdue" — it
 * gets a fixed 30-day grace period ("Due") before flipping to Overdue.
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

        // No log yet — count from registration date instead, so a
        // brand-new farm isn't instantly flagged Overdue on day one.
        $anchorDate = $lastLog
            ? Carbon::parse($lastLog->performed_at)
            : Carbon::parse($farm->created_at);

        $intervalDays = self::INTERVAL_DAYS[$farm->farm_size] ?? self::INTERVAL_DAYS['Medium'];
        $dueDate      = $anchorDate->copy()->addDays($intervalDays);
        $overdueDate  = $dueDate->copy()->addDays(self::GRACE_PERIOD_DAYS);

        $today = Carbon::now();

        if ($today->lessThan($dueDate)) {
            $status = 'Up to date';
        } elseif ($today->lessThan($overdueDate)) {
            $status = 'Due';
        } else {
            $status = 'Overdue';
        }

        return [
            'status'                 => $status,
            'last_performed_at'      => $lastLog?->performed_at?->format('M d, Y'),
            'days_since'             => (int) round($anchorDate->diffInDays($today)),
            'expected_interval_days' => $intervalDays,
            'days_overdue'           => $status === 'Overdue' ? (int) round($overdueDate->diffInDays($today)) : 0,
        ];
    }
}