<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inspection;
use App\Models\ActivityLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class InspectionController extends Controller
{
    public function index(Request $request)
    {
        $query = Inspection::with(['farm', 'assignedTo', 'scheduledBy']);

        if ($request->status) {
            $query->where('status', $request->status);
        }

        $inspections = $query->orderBy('scheduled_at')->get()->map(fn($i) => [
            'id'                => $i->id,
            'inspection_number' => $i->inspection_number,
            'farm_name'         => $i->farm->farm_name,
            'assigned_to'       => $i->assignedTo?->first_name . ' ' . $i->assignedTo?->last_name,
            'scheduled_by_name' => $i->scheduledBy ? $i->scheduledBy->first_name . ' ' . $i->scheduledBy->last_name : null,
            'inspection_type'   => $i->inspection_type,
            'notes'             => $i->notes,
            'findings'          => $i->findings,
            'status'            => $i->status,
            'scheduled_at'      => $i->scheduled_at,
            'previous_scheduled_at' => $i->previous_scheduled_at,
            'reschedule_reason'     => $i->reschedule_reason,
            'completed_at'      => $i->completed_at,
        ]);

        return response()->json(['success' => true, 'data' => $inspections]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'farm_id'         => 'required|exists:farms,id',
            'assigned_to'     => 'nullable|exists:users,id',
            'inspection_type' => 'required|in:General Inspection,Follow-up',
            'scheduled_at'    => 'required|date',
            'notes'           => 'nullable|string',
        ]);

        $scheduledDate = \Carbon\Carbon::parse($request->scheduled_at);

        // Rule 1 — no scheduling on a date that's already passed. Compared
        // by calendar date only (not time), so "today" is still valid even
        // if the current time has passed the requested time slot.
        if ($scheduledDate->startOfDay()->lt(now()->startOfDay())) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot schedule an inspection on a past date.',
            ], 422);
        }

        // Rule 2 — only one inspection per day, system-wide, regardless of
        // farm — inspections can be delicate for the chickens, so the LGU
        // limits itself to one site visit per day. Cancelled inspections
        // don't count as occupying that date.
        $alreadyBooked = Inspection::whereDate('scheduled_at', $scheduledDate->toDateString())
            ->where('status', '!=', 'Cancelled')
            ->exists();

        if ($alreadyBooked) {
            return response()->json([
                'success' => false,
                'message' => 'An inspection has already been scheduled for this date. Please select another available date.',
            ], 422);
        }

        $count  = Inspection::count() + 1;
        $number = 'INS-' . str_pad($count, 3, '0', STR_PAD_LEFT);

        $inspection = Inspection::create([
            'inspection_number' => $number,
            'farm_id'           => $request->farm_id,
            'assigned_to'       => $request->assigned_to,
            'scheduled_by'      => Auth::id(),
            'inspection_type'   => $request->inspection_type,
            'scheduled_at'      => $request->scheduled_at,
            'notes'             => $request->notes,
            'status'            => 'Scheduled',
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Scheduled Inspection',
            'details' => "Scheduled inspection {$number}",
            'type'    => 'Inspection',
        ]);

        $scheduledFor = $scheduledDate->format('F j, Y');

        if ($inspection->farm->user_id) {
            Notification::create([
                'user_id' => $inspection->farm->user_id,
                'title'   => 'Inspection Scheduled',
                'message' => "An inspection has been scheduled for your farm on {$scheduledFor}.",
                'type'    => 'Inspection Scheduled',
                'is_read' => false,
            ]);
        }

        if ($inspection->assigned_to) {
            Notification::create([
                'user_id' => $inspection->assigned_to,
                'title'   => 'Inspection Assigned',
                'message' => "You have been assigned an inspection for \"{$inspection->farm->farm_name}\" on {$scheduledFor}.",
                'type'    => 'Inspection Scheduled',
                'is_read' => false,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Inspection scheduled.',
            'data'    => $inspection,
        ]);
    }

    public function cancel(int $id)
    {
        $inspection = Inspection::findOrFail($id);
        $inspection->update(['status' => 'Cancelled']);

        return response()->json([
            'success' => true,
            'message' => 'Inspection cancelled.',
        ]);
    }

    /**
     * Moves a Scheduled inspection to a new date/time without touching its
     * status or identity — keeps a record of what the previous schedule
     * was and why, instead of the Cancel-and-recreate workaround. Mirrors
     * the same reschedule shape used by service requests (Admin & Vet).
     */
    public function reschedule(Request $request, int $id)
    {
        $request->validate([
            'scheduled_at' => 'required|date',
            'reason'       => 'required|string',
        ]);

        $inspection = Inspection::findOrFail($id);
        $scheduledDate = \Carbon\Carbon::parse($request->scheduled_at);

        if ($scheduledDate->startOfDay()->lt(now()->startOfDay())) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot reschedule an inspection to a past date.',
            ], 422);
        }

        $alreadyBooked = Inspection::whereDate('scheduled_at', $scheduledDate->toDateString())
            ->where('status', '!=', 'Cancelled')
            ->where('id', '!=', $inspection->id)
            ->exists();

        if ($alreadyBooked) {
            return response()->json([
                'success' => false,
                'message' => 'An inspection has already been scheduled for this date. Please select another available date.',
            ], 422);
        }

        $inspection->update([
            'previous_scheduled_at' => $inspection->scheduled_at,
            'scheduled_at'          => $request->scheduled_at,
            'reschedule_reason'     => $request->reason,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Rescheduled Inspection',
            'details' => "{$inspection->inspection_number} — {$inspection->farm->farm_name}",
            'type'    => 'Inspection',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Inspection rescheduled.',
            'data'    => $inspection,
        ]);
    }

    public function complete(Request $request, int $id)
    {
        $request->validate([
            'findings' => 'required|string',
        ]);

        $inspection = Inspection::findOrFail($id);
        $inspection->update([
            'status'       => 'Completed',
            'findings'     => $request->findings,
            'completed_at' => now(),
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Completed Inspection',
            'details' => "{$inspection->inspection_number} — {$inspection->farm->farm_name}",
            'type'    => 'Inspection',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Inspection marked as completed.',
            'data'    => $inspection,
        ]);
    }
}