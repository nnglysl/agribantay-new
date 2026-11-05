<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Sensor;
use App\Support\LocalTime;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        \App\Support\TableQuery::validate($request);
        $query = ActivityLog::with('user');

        if ($request->type) {
            $query->where('type', $request->type);
        }

        if ($request->role) {

            if ($request->role === 'System') {
                $query->whereNull('user_id');
            } else {
                $query->whereHas('user', fn($q) => $q->where('role', $request->role));
            }
        }

        $deviceKeys = Sensor::pluck('device_key')->filter()->all();

        \App\Support\TableQuery::dates($query, $request, 'created_at');
        \App\Support\TableQuery::search($query, $request, ['action', 'details'], ['user' => ['first_name', 'last_name']]);
        $query->latest()->orderByDesc('id');
        $logs = \App\Support\TableQuery::rows($query, $request)->map(fn($log) => [
            'id'         => $log->id,
            'user'       => $log->user ? $log->user->first_name . ' ' . $log->user->last_name : 'System',
            'role'       => $log->user ? $log->user->role : 'System',
            'action'     => $log->action,
            'details'    => $this->redactDeviceKeys($log->details, $deviceKeys),
            'type'       => $log->type,
            'created_at'     => LocalTime::dateTime($log->created_at),
            'created_at_relative' => $log->created_at->diffForHumans(),
            'created_at_raw' => $log->created_at->toIso8601String(),
        ]);

        return response()->json(['success' => true, 'data' => \App\Support\TableQuery::payload($request, $logs)]);
    }

    private function redactDeviceKeys(?string $details, array $deviceKeys): ?string
    {
        if (!$details || !$deviceKeys) {
            return $details;
        }

        foreach ($deviceKeys as $key) {
            if (!str_contains($details, $key)) {
                continue;
            }

            $details = str_replace(" ({$key})", '', $details);
            $details = str_replace($key, '[device key hidden]', $details);
        }

        return $details;
    }
}
