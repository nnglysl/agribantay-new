<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class VaccinationRequestController extends Controller
{
    private function notifyRequester(ServiceRequest $sr, string $title, string $message): void
    {
        if (!$sr->requested_by) {
            return;
        }

        Notification::create([
            'user_id' => $sr->requested_by,
            'title'   => $title,
            'message' => $message,
            'type'    => 'Request Update',
            'is_read' => false,
        ]);
    }


    public function index()
    {
        $vetId = Auth::id();

        // Requests assigned to this vet OR unassigned pending requests they
        // could accept — now covers both Vaccine and Blood Test requests,
        // since both route to the vet role. Ordered oldest-first (was
        // ->latest()) so requests are naturally worked in the order they
        // were submitted; the frontend also re-sorts by id defensively, but
        // fixing it here too keeps the two in agreement.
        $requests = ServiceRequest::with(['farm', 'acceptedBy'])
            ->whereIn('service_type', ['Vaccine Request', 'Blood Test Request'])
            ->where(function ($q) use ($vetId) {
                $q->where('accepted_by', $vetId)
                  ->orWhereNull('accepted_by');
            })
            ->oldest()
            ->get()
            ->map(fn($r) => [
                    'id'             => $r->id,
                    'request_number' => $r->request_number,
                    'service_type'   => $r->service_type,
                    'farm_id'        => $r->farm->id,
                    'farm_name'      => $r->farm->farm_name,
                    'owner_name'     => $r->farm->owner_name,
                    'barangay'       => $r->farm->barangay,
                    'farm_size'      => $r->farm->farm_size,
                    'notes'          => $r->notes,
                    'status'         => $r->status,
                    'accepted_by'    => $r->acceptedBy ? $r->acceptedBy->first_name . ' ' . $r->acceptedBy->last_name : null,
                    'scheduled_at'   => $r->scheduled_at,
                    'previous_scheduled_at' => $r->previous_scheduled_at,
                    'reschedule_reason'     => $r->reschedule_reason,
                    'completed_at'   => $r->completed_at,
                    'created_at'     => $r->created_at,
                    'updated_at'     => $r->updated_at,
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
        ]);

        $sr = ServiceRequest::findOrFail($id);
        $sr->update([
            'accepted_by'  => Auth::id(),
            'status'       => 'Scheduled',
            'scheduled_at' => $request->scheduled_at,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Scheduled ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => $sr->service_type === 'Blood Test Request' ? 'Blood Test' : 'Vaccination',
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Scheduled',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" has been scheduled."
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' scheduled.',
            'data'    => $sr,
        ]);
    }

    public function decline(int $id)
    {
        $sr = ServiceRequest::findOrFail($id);
        $sr->update(['status' => 'Cancelled']);

        $this->notifyRequester(
            $sr,
            'Service Request Declined',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" was declined."
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' declined.',
        ]);
    }

    /**
     * Only reachable once the farm visit actually happened — the vet's
     * observations/actions/findings/recommendations from that visit are
     * required here rather than optional, since this is the one place in
     * the workflow those get recorded. A visit that didn't happen goes
     * through reschedule() instead, never here.
     */
    public function complete(Request $request, int $id)
    {
        $request->validate([
            'notes' => 'required|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);
        $sr->update([
            'status'       => 'Completed',
            'completed_at' => now(),
            'notes'        => $request->notes,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Completed ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => $sr->service_type === 'Blood Test Request' ? 'Blood Test' : 'Vaccination',
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Completed',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" has been completed."
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' marked as completed.',
            'data'    => $sr,
        ]);
    }

    /**
     * For a scheduled visit that didn't happen — moves the date/time
     * forward, keeps the request active (never touches status), and keeps
     * a record of what the previous schedule was and why it changed. Can
     * be called again if the new visit also falls through; each call
     * simply overwrites the "previous" snapshot with whatever was current
     * right before this reschedule.
     */
    public function reschedule(Request $request, int $id)
    {
        $request->validate([
            'scheduled_at' => 'required|date',
            'reason'       => 'required|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);
        $sr->update([
            'previous_scheduled_at' => $sr->scheduled_at,
            'scheduled_at'          => $request->scheduled_at,
            'reschedule_reason'     => $request->reason,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Rescheduled ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => $sr->service_type === 'Blood Test Request' ? 'Blood Test' : 'Vaccination',
        ]);

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' rescheduled.',
            'data'    => $sr,
        ]);
    }
}