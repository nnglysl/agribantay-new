<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\MaintenanceLog;
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

        return response()->json([
            'success' => true,
            'data' => $overdueFarms
        ]);
    }

    public function details(int $farmId)
    {
        $farm = Farm::findOrFail($farmId);

        $status = app(MaintenanceStatusService::class)->getStatus($farm);

        $graceStatus = match ($status['status']) {
            'Overdue'       => 'Within 30-day grace period',
            'Non-Compliant' => 'Grace period exceeded',
            default         => 'Not applicable',
        };

        $notifications = MaintenanceNotification::with('smsLog')
            ->where('farm_id', $farmId)
            ->orderByDesc('sent_at')
            ->get()
            ->map(fn($n) => [
                'event' => $n->event === 'overdue_reminder'
                    ? 'Overdue SMS reminder'
                    : 'Non-Compliance SMS notice',

                'sent_at' => $n->sent_at->format('M d, Y g:i A'),

                'status' => $n->smsLog?->status ?? 'Unknown',
            ]);

        $logs = MaintenanceLog::where('farm_id', $farmId)
            ->orderByDesc('performed_at')
            ->take(10)
            ->get()
            ->map(fn($log) => [
                'performed_at' => $log->performed_at->format('M d, Y'),
                'notes'        => $log->notes,

                'recorded_by'  => $farm->owner_name,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'farm' => [
                    'farm_name'  => $farm->farm_name,
                    'owner_name' => $farm->owner_name,
                    'barangay'   => $farm->barangay,
                    'farm_size'  => $farm->farm_size,
                ],

                'maintenance' => [
                    'due_date'          => $status['due_date'],
                    'last_performed_at' => $status['last_performed_at'] ?? 'Never logged',
                    'days_overdue'      => $status['days_overdue'],
                    'status'            => $status['status'],
                    'grace_status'      => $graceStatus,
                ],

                'notifications' => $notifications,

                'logs' => $logs,
            ],
        ]);
    }
}