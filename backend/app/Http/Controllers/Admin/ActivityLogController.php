<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = ActivityLog::with('user');

        if ($request->type) {
            $query->where('type', $request->type);
        }

        if ($request->role) {
            $query->where('role', $request->role);
        }

        $logs = $query->latest()->take(100)->get()->map(fn($log) => [
            'id'         => $log->id,
            'user'       => $log->user ? $log->user->first_name . ' ' . $log->user->last_name : 'System',
            'role'       => $log->role ?? 'System',
            'action'     => $log->action,
            'details'    => $log->details,
            'type'       => $log->type,
            'created_at' => $log->created_at->diffForHumans(),
        ]);

        return response()->json(['success' => true, 'data' => $logs]);
    }
}