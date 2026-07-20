<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AlertHistory;
use Illuminate\Http\Request;

/**
 * Objective 5.2 — read side. AlertHistoryService (called from
 * SensorIngestController) writes the rows this controller reads. This
 * page is a logbook, not a live alert feed — every row here already
 * happened, whether it's still ongoing or resolved.
 */
class AlertHistoryController extends Controller
{
    public function index(Request $request)
    {
        $query = AlertHistory::with('farm')->orderByDesc('triggered_at');

        if ($request->farm_id) {
            $query->where('farm_id', $request->farm_id);
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->sensor_type) {
            $query->where('sensor_type', $request->sensor_type);
        }

        if ($request->from) {
            $query->where('triggered_at', '>=', $request->from);
        }

        if ($request->to) {
            $query->where('triggered_at', '<=', $request->to);
        }

        $history = $query->get()->map(fn($a) => [
            'id'           => $a->id,
            'farm_id'      => $a->farm_id,
            'farm_name'    => $a->farm->farm_name,
            'sensor_type'  => ucfirst($a->sensor_type),
            'status'       => $a->status,
            'value'        => $a->value,
            'triggered_at' => $a->triggered_at->format('M d, Y g:i A'),
            'resolved_at'  => $a->resolved_at?->format('M d, Y g:i A'),
            'is_ongoing'   => is_null($a->resolved_at),
            'duration'     => $this->formatDuration($a->triggered_at, $a->resolved_at),
        ]);

        return response()->json(['success' => true, 'data' => $history]);
    }

    private function formatDuration($start, $end): string
    {
        $end = $end ?? now();
        $minutes = $start->diffInMinutes($end);

        if ($minutes < 60) return "{$minutes}m";

        $hours = intdiv($minutes, 60);
        if ($hours < 24) return "{$hours}h";

        $days = intdiv($hours, 24);
        return "{$days}d";
    }
}