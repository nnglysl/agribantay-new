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
        // A Device Key is a credential — whatever holds it can post readings
        // as that device. Registration entries written before the logger
        // stopped including it still have the full key in `details`, so it is
        // stripped here, at the only place logs are displayed, rather than by
        // rewriting the stored audit rows. Keys are short and few (one row per
        // physical device), so this is a single extra query.
        $deviceKeys = Sensor::pluck('device_key')->filter()->all();

        $logs = $query->latest()->take(100)->get()->map(fn($log) => [
            'id'         => $log->id,
            'user'       => $log->user ? $log->user->first_name . ' ' . $log->user->last_name : 'System',
            'role'       => $log->user ? $log->user->role : 'System',
            'action'     => $log->action,
            'details'    => $this->redactDeviceKeys($log->details, $deviceKeys),
            'type'       => $log->type,
            // An actual date and time, in Manila, like every other timestamp
            // this system shows. diffForHumans() used to be sent here, so the
            // column headed "Time" read "3 days ago" and never named the day
            // or the hour an action was taken — which is the one thing an
            // audit trail has to be able to answer.
            'created_at'     => LocalTime::dateTime($log->created_at),
            'created_at_relative' => $log->created_at->diffForHumans(),
            'created_at_raw' => $log->created_at->toIso8601String(),
        ]);

        return response()->json(['success' => true, 'data' => $logs]);
    }

    /**
     * Remove any full Device Key from a log line, keeping the rest of the
     * sentence readable. "Registered device Device 1 (AGB-D01-X7K92) for
     * Gly's Farm" becomes "Registered device Device 1 for Gly's Farm"; a key
     * appearing outside parentheses is replaced with a placeholder so the
     * sentence does not silently lose a word.
     */
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