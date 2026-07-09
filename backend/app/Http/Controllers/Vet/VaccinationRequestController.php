<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class VaccinationRequestController extends Controller
{
    public function index()
    {
        $vetId = Auth::id();

        // Requests assigned to this vet OR unassigned pending vaccine requests they could accept
        $requests = ServiceRequest::with('farm')
            ->where('service_type', 'Vaccine Request')
            ->where(function ($q) use ($vetId) {
                $q->where('assigned_to', $vetId)
                  ->orWhereNull('assigned_to');
            })
            ->latest()
            ->get()
            ->map(fn($r) => [
                'id'             => $r->id,
                'request_number' => $r->request_number,
                'farm_name'      => $r->farm->farm_name,
                'owner_name'     => $r->farm->owner_name,
                'barangay'       => $r->farm->barangay,
                'farm_size'      => $r->farm->farm_size,
                'notes'          => $r->notes,
                'status'         => $r->status,
                'scheduled_at'   => $r->scheduled_at,
                'completed_at'   => $r->completed_at,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'scheduled' => $requests->whereIn('status', ['Scheduled', 'Pending'])->values(),
                'completed' => $requests->where('status', 'Completed')->values(),
            ],
        ]);
    }

    public function accept(Request $request, int $id)
    {
        $request->validate([
            'scheduled_at' => 'required|date',
            'notes'        => 'nullable|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);
        $sr->update([
            'assigned_to'  => Auth::id(),
            'status'       => 'Scheduled',
            'scheduled_at' => $request->scheduled_at,
            'notes'        => $request->notes ?? $sr->notes,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'vet',
            'action'  => 'Scheduled vaccination',
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => 'Vaccination',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Vaccination scheduled.',
            'data'    => $sr,
        ]);
    }

    public function decline(int $id)
    {
        $sr = ServiceRequest::findOrFail($id);
        $sr->update(['status' => 'Cancelled']);

        return response()->json([
            'success' => true,
            'message' => 'Vaccination request declined.',
        ]);
    }

    public function complete(int $id)
    {
        $sr = ServiceRequest::findOrFail($id);
        $sr->update([
            'status'       => 'Completed',
            'completed_at' => now(),
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'vet',
            'action'  => 'Completed vaccination',
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => 'Vaccination',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Vaccination marked as completed.',
            'data'    => $sr,
        ]);
    }

    public function addNote(Request $request, int $id)
    {
        $request->validate([
            'notes' => 'required|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);
        $sr->update(['notes' => $request->notes]);

        return response()->json([
            'success' => true,
            'message' => 'Note saved.',
            'data'    => $sr,
        ]);
    }
}