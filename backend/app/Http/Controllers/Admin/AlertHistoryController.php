<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AlertHistory;
use Illuminate\Http\Request;
use App\Support\LocalTime;

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
        $query = AlertHistory::with(['farm.user', 'sensor'])->orderByDesc('triggered_at');

        if ($request->farm_id) {
            $query->where('farm_id', $request->farm_id);
        }

        // Barangay lives on the farm, not on the incident, so it is matched
        // through the relationship rather than duplicated onto alert_history.
        // Applied as its own clause so it composes with farm/severity/sensor
        // instead of replacing them, and clearing it drops only this one.
        if ($request->barangay) {
            $query->whereHas('farm', function ($q) use ($request) {
                $q->where('barangay', $request->barangay);
            });
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->sensor_type) {
            $query->where('sensor_type', $request->sensor_type);
        }

        // Which poultry house. Now that a farm runs one device per house, "is
        // it both houses or just one" is usually the next question after
        // seeing an alert, and the sensor_type filter alone cannot answer it.
        if ($request->sensor_id) {
            $query->where('sensor_id', $request->sensor_id);
        }

        if ($request->from) {
            $query->where('triggered_at', '>=', $request->from);
        }

        if ($request->to) {
            $query->where('triggered_at', '<=', $request->to);
        }

        // Separate from the severity `status` filter above. 'Ongoing' = still open (resolved_at
        // is null), 'Resolved' = closed. This is the Status filter on the page.
        if ($request->alert_status === 'Ongoing') {
            $query->whereNull('resolved_at');
        } elseif ($request->alert_status === 'Resolved') {
            $query->whereNotNull('resolved_at');
        }
        // Search across Farm ID, Farm Owner Name, Alert Type, or Alert ID —
        // done at the query level (not after mapping) so it composes
        // correctly with the filters above and stays efficient.
        if ($request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('id', 'like', "%{$s}%")
                  ->orWhere('farm_id', 'like', "%{$s}%")
                  ->orWhere('sensor_type', 'like', "%{$s}%")
                  ->orWhereHas('farm', function ($fq) use ($s) {
                      $fq->where('farm_name', 'like', "%{$s}%");
                  })
                  ->orWhereHas('sensor', function ($sq) use ($s) {
                      $sq->where('label', 'like', "%{$s}%")
                         ->orWhere('sensor_code', 'like', "%{$s}%");
                  })
                  ->orWhereHas('farm.user', function ($uq) use ($s) {
                      $uq->where('first_name', 'like', "%{$s}%")
                         ->orWhere('last_name', 'like', "%{$s}%")
                         ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ["%{$s}%"]);
                  });
            });
        }

        $records = $query->get();

        $history = $records->map(fn($a) => [
            'id'              => $a->id,
            'farm_id'         => $a->farm_id,
            'farm_name'       => $a->farm->farm_name,
            'farm_barangay'  => $a->farm->barangay,
            'farm_owner_name' => $a->farm->user
                ? trim($a->farm->user->first_name . ' ' . $a->farm->user->last_name)
                : null,
            // Farm names are not unique, and a farm can run several houses.
            // The mobile number IS unique (see the users table), so it is what
            // actually tells two same-named farms apart when staff are acting
            // on an alert.
            'farm_owner_mobile' => $a->farm->user?->mobile_number,
            // Which poultry house. Null for incidents recorded before
            // per-device tracking, or whose unit has since been deleted.
            'device_name'     => $a->sensor?->device_name,
            'sensor_type'     => ucfirst($a->sensor_type),
            'status'          => $a->status,
            'value'           => $a->value,
            'triggered_at'    => LocalTime::dateTime($a->triggered_at),
            'resolved_at'     => LocalTime::dateTime($a->resolved_at),
            // The display strings above are for reading, not for ordering:
            // re-parsing "Oct 01, 2026 10:45 AM" in the browser is unreliable
            // and silently yields NaN in some engines, which turns a sort into
            // a no-op. These ISO instants give the frontend something it can
            // actually sort on, matching the *_raw convention already used by
            // the inspection and disposal payloads.
            'triggered_at_raw' => $a->triggered_at?->toIso8601String(),
            'resolved_at_raw'  => $a->resolved_at?->toIso8601String(),
            'is_ongoing'      => is_null($a->resolved_at),
            'duration'        => $this->formatDuration($a->triggered_at, $a->resolved_at),
        ]);

        return response()->json([
            'success' => true,
            'data'    => $history,
            // Overall total, independent of pagination on the frontend —
            // reflects however many rows matched the current filters/search.
            'total_count' => $history->count(),
        ]);
    }

     private function formatDuration(\Carbon\Carbon $start, ?\Carbon\Carbon $end): string
    {
        $end = $end ?? now();

        // Carbon 3 returns a float here (Carbon 2 returned an int), which
        // rendered as "22.213284m" in the Duration column. Floor to whole
        // minutes before any of the arithmetic below.
        $minutes = (int) floor($start->diffInMinutes($end));

        if ($minutes < 1) return 'under a minute';
        if ($minutes < 60) return "{$minutes}m";

        $hours = intdiv($minutes, 60);
        $restMinutes = $minutes % 60;

        if ($hours < 24) {
            return $restMinutes ? "{$hours}h {$restMinutes}m" : "{$hours}h";
        }

        $days = intdiv($hours, 24);
        $restHours = $hours % 24;

        return $restHours ? "{$days}d {$restHours}h" : "{$days}d";
    }
}