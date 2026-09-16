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
            ->with('latestCleanout')
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
            'data' => $overdueFarms,
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
                    ? 'Overdue Reminder'
                    : 'Non-Compliance Notice',

                // Mirrors the exact SMS body CheckMaintenanceCompliance
                // sends for each event — not invented copy, the real
                // message content the farmer actually received.
                'description' => $n->event === 'overdue_reminder'
                    ? 'Your manure clean-out is overdue. Please clean and properly dispose of accumulated manure and update your manure record.'
                    : 'Your manure clean-out is still overdue and has exceeded the 30-day grace period. Please complete the required clean-out and update your manure record.',

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

                // Only the farm owner ever logs their own clean-outs
                // today — no separate "recorded by" field exists on
                // maintenance_logs.
                'recorded_by'  => $farm->owner_name,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'farm' => [
                    'id'            => $farm->id,
                    'farm_name'     => $farm->farm_name,
                    'farm_type'     => $farm->farm_type,
                    'owner_name'    => $farm->owner_name,
                    'mobile_number' => $farm->mobile_number,
                    'barangay'      => $farm->barangay,
                    'farm_size'     => $farm->farm_size,
                    'created_at'    => $farm->created_at->format('M d, Y'),
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