<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inspection;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class InspectionController extends Controller
{
    public function index(Request $request)
    {
        $query = Inspection::with(['farm', 'assignedTo']);

        if ($request->status) {
            $query->where('status', $request->status);
        }

        $inspections = $query->orderBy('scheduled_at')->get()->map(fn($i) => [
            'id'                => $i->id,
            'inspection_number' => $i->inspection_number,
            'farm_name'         => $i->farm->farm_name,
            'assigned_to'       => $i->assignedTo?->first_name . ' ' . $i->assignedTo?->last_name,
            'inspection_type'   => $i->inspection_type,
            'notes'             => $i->notes,
            'findings'          => $i->findings,
            'status'            => $i->status,
            'scheduled_at'      => $i->scheduled_at,
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
            'inspection_type'   => $request->inspection_type,
            'scheduled_at'      => $request->scheduled_at,
            'notes'             => $request->notes,
            'status'            => 'Scheduled',
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Scheduled Inspection',
            'details' => "Scheduled inspection {$number}",
            'type'    => 'Inspection',
        ]);

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
            'role'    => 'admin',
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