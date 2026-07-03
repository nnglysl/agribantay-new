<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ServiceRequestController extends Controller
{
    public function index()
    {
        $farm = Farm::where('user_id', Auth::id())->firstOrFail();

        $requests = ServiceRequest::with('assignedTo')
            ->where('farm_id', $farm->id)
            ->latest()
            ->get()
            ->map(fn($r) => [
                'id'             => $r->id,
                'request_number' => $r->request_number,
                'service_type'   => $r->service_type,
                'notes'          => $r->notes,
                'status'         => $r->status,
                'priority'       => $r->priority,
                'assigned_to'    => $r->assignedTo ? $r->assignedTo->first_name . ' ' . $r->assignedTo->last_name : null,
                'scheduled_at'   => $r->scheduled_at,
                'completed_at'   => $r->completed_at,
                'created_at'     => $r->created_at,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'active' => $requests->whereIn('status', ['Pending', 'Scheduled'])->values(),
                'past'   => $requests->whereIn('status', ['Completed', 'Cancelled'])->values(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $farm = Farm::where('user_id', Auth::id())->firstOrFail();

        $request->validate([
            'service_type' => 'required|in:Vaccine Request,Odor Control Request',
            'notes'        => 'nullable|string',
        ]);

        $count  = ServiceRequest::count() + 1000;
        $number = 'SR-' . $count;

        $serviceRequest = ServiceRequest::create([
            'request_number' => $number,
            'farm_id'        => $farm->id,
            'requested_by'   => Auth::id(),
            'service_type'   => $request->service_type,
            'notes'          => $request->notes,
            'status'         => 'Pending',
            'priority'       => 'Medium',
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'farm_owner',
            'action'  => 'Submitted ' . strtolower($request->service_type),
            'details' => "{$number} — {$farm->farm_name}",
            'type'    => 'Request',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Service request submitted.',
            'data'    => $serviceRequest,
        ]);
    }
}