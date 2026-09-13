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
            // "System" entries have no associated user account at all, so
            // they can't be matched via the user relationship like every
            // other role can.
            if ($request->role === 'System') {
                $query->whereNull('user_id');
            } else {
                $query->whereHas('user', fn($q) => $q->where('role', $request->role));
            }
        }

        // Role is read from the actor's current account (`user->role`)
        // rather than the `activity_logs.role` column — that column is a
        // snapshot taken when the row was written and has historically
        // been wrong for Super Admins acting through shared Admin/Vet
        // routes (it recorded "admin"/"vet" unconditionally). Deriving it
        // from the account itself keeps every row, past and future,
        // showing the actor's real role.
        $logs = $query->latest()->take(100)->get()->map(fn($log) => [
            'id'         => $log->id,
            'user'       => $log->user ? $log->user->first_name . ' ' . $log->user->last_name : 'System',
            'role'       => $log->user ? $log->user->role : 'System',
            'action'     => $log->action,
            'details'    => $log->details,
            'type'       => $log->type,
            'created_at' => $log->created_at->diffForHumans(),
            'created_at_raw' => $log->created_at->toIso8601String(),
        ]);

        return response()->json(['success' => true, 'data' => $logs]);
    }
}