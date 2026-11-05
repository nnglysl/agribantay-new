<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\MaintenanceLog;
use App\Models\MaintenanceNotification;
use App\Services\MaintenanceStatusService;
use Illuminate\Http\Request;
use App\Support\LocalTime;

class MaintenanceController extends Controller
{
    public function overdue(Request $request)
    {
        \App\Support\TableQuery::validate($request);
        $service = app(MaintenanceStatusService::class);

        $query = Farm::where('status', 'Active')->with('qualifyingCleanouts');
        foreach (['barangay', 'farm_size'] as $filter) {
            if ($request->filled($filter)) $query->where($filter, $request->input($filter));
        }
        \App\Support\TableQuery::search($query, $request, ['id', 'owner_name', 'farm_name']);
        $overdueFarms = $query->get()
            ->map(function ($farm) use ($service) {
                $status = $service->getStatus($farm);

                return [
                    ...$status,
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
            ->filter(fn($f) => $f['status'] === 'Non-Compliant');

        if ($request->search) {
            $s = strtolower($request->search);

            $overdueFarms = $overdueFarms->filter(function ($f) use ($s) {
                return str_contains((string) $f['farm_id'], $s)
                    || str_contains(strtolower($f['owner_name']), $s)
                    || str_contains(strtolower($f['farm_name']), $s);
            });
        }

        $overdueFarms = $overdueFarms->sortBy([['days_overdue', 'desc'], ['farm_id', 'desc']])->values();
        $overdueFarms = \App\Support\TableQuery::derived($overdueFarms, $request);

        return response()->json([
            'success' => true,
            'data' => \App\Support\TableQuery::payload($request, $overdueFarms),
        ]);
    }

    public function details(int $farmId)
    {
        $farm = Farm::findOrFail($farmId);

        $status = app(MaintenanceStatusService::class)->getStatus($farm);

        $notifications = MaintenanceNotification::with('smsLog')
            ->where('farm_id', $farmId)
            ->orderByDesc('sent_at')
            ->get()
            ->map(fn($n) => [
                'event' => $n->event === 'overdue_reminder'
                    ? 'Overdue Reminder'
                    : 'Non-Compliance Notice',

                'description' => $n->smsLog?->message ?? 'No linked SMS message is available for this historical event.',

                'sent_at' => LocalTime::dateTime($n->sent_at),

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
                    'id'            => $farm->id,
                    'farm_name'     => $farm->farm_name,
                    'farm_type'     => $farm->farm_type,
                    'owner_name'    => $farm->owner_name,
                    'mobile_number' => $farm->mobile_number,
                    'barangay'      => $farm->barangay,
                    'farm_size'     => $farm->farm_size,
                    'created_at'    => LocalTime::date($farm->created_at),
                ],

                'maintenance' => $status,

                'notifications' => $notifications,

                'logs' => $logs,
            ],
        ]);
    }
}
