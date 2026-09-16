<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use App\Models\Notification;
use App\Services\SuperAdminNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class VaccinationRequestController extends Controller
{
    private function notifyRequester(ServiceRequest $sr, string $title, string $message): void
    {
        // Super Admin gets the same update for system-wide oversight.
        SuperAdminNotifier::notify($title, preg_replace('/^Your /', 'The ', $message), 'Request Update', '/superadmin/service-requests');

        if (!$sr->requested_by) {
            return;
        }

        Notification::create([
            'user_id' => $sr->requested_by,
            'title'   => $title,
            'message' => $message,
            'type'    => 'Request Update',
            'link'    => '/farmowner/service-requests',
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
                    'completion_notes' => $r->completion_notes,
                    'status'         => $r->status,
                    'accepted_by'    => $r->acceptedBy ? $r->acceptedBy->first_name . ' ' . $r->acceptedBy->last_name : null,
                    'scheduled_at'   => $r->scheduled_at,
                    'previous_scheduled_at' => $r->previous_scheduled_at,
                    'reschedule_reason'     => $r->reschedule_reason,
                    'decline_reason' => $r->decline_reason,
                    'completed_at'   => $r->completed_at,
                    'created_at'     => $r->created_at,
                    'updated_at'     => $r->updated_at,
                ]);

        return response()->json([
            'success' => true,
            'data' => [
                'scheduled' => $requests->whereIn('status', ['Scheduled', 'Pending'])->values(),
                'completed' => $requests->where('status', 'Completed')->values(),
                // Completed + declined, so a declined request stays visible.
                'history'   => $requests->whereIn('status', ['Completed', 'Cancelled'])->values(),
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

    public function decline(Request $request, int $id)
    {
        $request->validate([
            'decline_reason' => 'required|string|min:3',
        ]);

        $sr = ServiceRequest::findOrFail($id);
        $sr->update(['status' => 'Cancelled', 'decline_reason' => $request->decline_reason]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Declined Service Request',
            'details' => "{$sr->service_type} — {$sr->farm->farm_name}",
            'type'    => 'Service',
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Declined',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" was declined: {$request->decline_reason}"
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
            'completion_notes' => 'required|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);

        // Only an accepted, scheduled visit can be completed — never a
        // Pending, Cancelled or already-Completed request, even via the API.
        if ($sr->status !== 'Scheduled') {
            return response()->json([
                'success' => false,
                'message' => 'Only a scheduled request can be marked as completed.',
            ], 422);
        }

        // completion_notes is its own column so the farmer's original
        // request text in `notes` is never overwritten.
        $sr->update([
            'status'           => 'Completed',
            'completed_at'     => now(),
            'completion_notes' => $request->completion_notes,
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
     * Undo an accidental completion. The request goes back to Scheduled —
     * not Pending, since it was already accepted — keeping its schedule,
     * acceptor and reschedule history; only status/completed_at change.
     * If its date has already passed it will show under Overdue (derived).
     */
    public function reopen(int $id)
    {
        $sr = ServiceRequest::findOrFail($id);

        if ($sr->status !== 'Completed') {
            return response()->json([
                'success' => false,
                'message' => 'Only a completed request can have its completion undone.',
            ], 422);
        }

        // Reopening must not sidestep the farmer's one-active-request-per-
        // service rule: if they've since submitted another request for the
        // same service, this one stays completed.
        $hasOtherActive = ServiceRequest::where('farm_id', $sr->farm_id)
            ->where('service_type', $sr->service_type)
            ->where('id', '!=', $sr->id)
            ->whereIn('status', ['Pending', 'Scheduled'])
            ->exists();

        if ($hasOtherActive) {
            return response()->json([
                'success' => false,
                'message' => 'The completion cannot be undone because another active request for the same service already exists.',
            ], 422);
        }

        $sr->update([
            'status'       => 'Scheduled',
            'completed_at' => null,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Undid completion of ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => $sr->service_type === 'Blood Test Request' ? 'Blood Test' : 'Vaccination',
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Completion Undone',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" was marked completed by mistake; its completion was undone and it has returned to its active scheduled state."
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' completion undone. The request has returned to its active scheduled state.',
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