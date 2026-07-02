<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ServiceRequestController extends Controller
{
    public function index(Request $request)
    {
        $query = ServiceRequest::with(['farm', 'requestedBy', 'assignedTo']);

        if ($request->status) {
            $query->where('status', $request->status);
        }

        $requests = $query->latest()->get()->map(fn($r) => [
            'id'             => $r->id,
            'request_number' => $r->request_number,
            'farm_name'      => $r->farm->farm_name,
            'requested_by'   => $r->requestedBy->first_name . ' ' . $r->requestedBy->last_name,
            'assigned_to'    => $r->assignedTo ? $r->assignedTo->first_name . ' ' . $r->assignedTo->last_name : null,
            'service_type'   => $r->service_type,
            'notes'          => $r->notes,
            'status'         => $r->status,
            'priority'       => $r->priority,
            'scheduled_at'   => $r->scheduled_at,
            'completed_at'   => $r->completed_at,
            'created_at'     => $r->created_at,
        ]);

        return response()->json(['success' => true, 'data' => $requests]);
    }

    public function cancel(int $id)
    {
        $sr = ServiceRequest::findOrFail($id);
        $sr->update(['status' => 'Cancelled']);

        return response()->json(['success' => true, 'message' => 'Request cancelled.']);
    }
}