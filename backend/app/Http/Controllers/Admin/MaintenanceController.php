<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Services\MaintenanceStatusService;

/**
 * Objective 5.1 — Overdue Maintenance Monitoring. Purely a reporting
 * layer on top of objective 3.2's MaintenanceStatusService — no new
 * data, no new table. Same per-farm calculation already used in the
 * Farm Profile modal, just looped over every active farm and filtered
 * down to the ones currently Overdue, worst first.
 */
class MaintenanceController extends Controller
{
    public function overdue()
    {
        $service = app(MaintenanceStatusService::class);

        $overdueFarms = Farm::where('status', 'Active')
            ->get()
            ->map(function ($farm) use ($service) {
                $status = $service->getStatus($farm);
                return [
                    'farm_id'           => $farm->id,
                    'farm_name'         => $farm->farm_name,
                    'owner_name'        => $farm->owner_name,
                    'barangay'          => $farm->barangay,
                    'farm_size'         => $farm->farm_size,
                    'status'            => $status['status'],
                    'days_overdue'      => $status['days_overdue'],
                    'last_performed_at' => $status['last_performed_at'],
                ];
            })
            ->filter(fn($f) => $f['status'] === 'Overdue')
            ->sortByDesc('days_overdue')
            ->values();

        return response()->json(['success' => true, 'data' => $overdueFarms]);
    }
}