<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\MaintenanceNotification;
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

                $event = match ($status['status']) {
                    'Overdue'       => 'overdue_reminder',
                    'Non-Compliant' => 'non_compliant_notice',
                    default         => null,
                };

                $smsStatus = 'Not applicable';
                if ($event) {
                    $notified = MaintenanceNotification::with('smsLog')
                        ->where('farm_id', $farm->id)
                        ->where('event', $event)
                        ->where('anchor_date', $status['anchor_date'])
                        ->first();

                    $smsStatus = $notified
                        ? ($notified->smsLog?->status ?? 'Sent')
                        : 'Pending (runs next 8:00 AM check)';
                }

                return [
                    'farm_id'           => $farm->id,
                    'farm_name'         => $farm->farm_name,
                    'owner_name'        => $farm->owner_name,
                    'barangay'          => $farm->barangay,
                    'farm_size'         => $farm->farm_size,
                    'status'            => $status['status'], // 'Overdue' | 'Non-Compliant'
                    'days_overdue'      => $status['days_overdue'],
                    'last_performed_at' => $status['last_performed_at'],
                    'sms_status'        => $smsStatus,
                    'maintenance_type'  => 'Full Manure Clean-out',
                ];
            })
            ->filter(fn($f) => in_array($f['status'], ['Overdue', 'Non-Compliant'], true));

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