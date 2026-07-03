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