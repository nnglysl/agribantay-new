<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Services\MaintenanceStatusService;
use Illuminate\Http\Request;

/**
 * Objective 5.1 — Overdue Maintenance Monitoring. Purely a reporting
 * layer on top of objective 3.2's MaintenanceStatusService — no new
 * data, no new table. Same per-farm calculation already used in the
 * Farm Profile modal, just looped over every active farm and filtered
 * down to the ones currently Overdue, worst first.
 */
class MaintenanceController extends Controller
{
    public function overdue(Request $request)
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
                    // Currently always "Full Manure Clean-out" — kept as
                    // its own field so search-by-type still works
                    // correctly if additional maintenance types are ever
                    // introduced later.
                    'maintenance_type'  => 'Full Manure Clean-out',
                ];
            })
            ->filter(fn($f) => $f['status'] === 'Overdue');

        // Search across Farm ID, Farm Owner Name, Farm Name, or
        // Maintenance Type — applied after the Overdue filter above,
        // on the same small in-memory collection (this report is
        // computed per-farm, not a simple DB query, so search happens
        // here rather than at the query level).
        if ($request->search) {
            $s = strtolower($request->search);
            $overdueFarms = $overdueFarms->filter(function ($f) use ($s) {
                return str_contains((string) $f['farm_id'], $s)
                    || str_contains(strtolower($f['owner_name']), $s)
                    || str_contains(strtolower($f['farm_name']), $s)
                    || str_contains(strtolower($f['maintenance_type']), $s);
            });
        }

        $overdueFarms = $overdueFarms->sortByDesc('days_overdue')->values();

        return response()->json(['success' => true, 'data' => $overdueFarms]);
    }
}