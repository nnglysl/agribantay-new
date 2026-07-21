<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

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

        // Matches the four options actually offered in the farmer's
        // "Request a Service" dropdown — Blood Test and Fly Control were
        // missing here, which is why selecting either failed validation.
        $request->validate([
            'service_type' => 'required|in:Vaccine Request,Blood Test Request,Odor Control Request,Fly Control Request',
            'notes'        => 'nullable|string',
        ]);

        // Wrapped in a transaction with a locking read on the MAX numeric
        // suffix across ALL rows (not just the most recent by id) so two
        // near-simultaneous submissions can't both compute the same "next
        // number" and collide. Using MAX(...) rather than the latest row's
        // id is what fixes the SR-1008 duplicate — the previous version
        // assumed the highest id always had the highest number, which broke
        // if any row (e.g. seeded/test data) was inserted out of order.
        $serviceRequest = DB::transaction(function () use ($request, $farm) {
            $maxSeq = DB::table('service_requests')
                ->lockForUpdate()
                ->selectRaw("MAX(CAST(SUBSTRING(request_number, 4) AS UNSIGNED)) as max_seq")
                ->value('max_seq');

            $nextSeq = $maxSeq ? $maxSeq + 1 : 1000;
            $number = 'SR-' . $nextSeq;

            return ServiceRequest::create([
                'request_number' => $number,
                'farm_id'        => $farm->id,
                'requested_by'   => Auth::id(),
                'service_type'   => $request->service_type,
                'notes'          => $request->notes,
                'status'         => 'Pending',
                'priority'       => 'Medium',
            ]);
        });

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'farm_owner',
            'action'  => 'Submitted ' . strtolower($request->service_type),
            'details' => "{$serviceRequest->request_number} — {$farm->farm_name}",
            'type'    => 'Request',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Service request submitted.',
            'data'    => $serviceRequest,
        ]);
    }
}