<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Services\MaintenanceStatusService;
use Illuminate\Http\Request;

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
                    'status'            => $status['status'], // 'Overdue' | 'Non-Compliant'
                    'days_overdue'      => $status['days_overdue'],
                    'last_performed_at' => $status['last_performed_at'],
                ];
            })
            ->filter(fn($f) => in_array($f['status'], ['Overdue', 'Non-Compliant'], true));

        if ($request->search) {
            $s = strtolower($request->search);
            $overdueFarms = $overdueFarms->filter(function ($f) use ($s) {
                return str_contains((string) $f['farm_id'], $s)
                    || str_contains(strtolower($f['owner_name']), $s)
                    || str_contains(strtolower($f['farm_name']), $s);
            });
        }

        $overdueFarms = $overdueFarms->sortByDesc('days_overdue')->values();

        return response()->json(['success' => true, 'data' => $overdueFarms]);
    }
}