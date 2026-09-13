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