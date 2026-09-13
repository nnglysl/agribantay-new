<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ServiceRequestController extends Controller
{
    // Vaccine and blood test requests are handled exclusively through
    // the Vet's own module for regular Admins — excluded from their view
    // so the same request can't be actioned from two different places.
    // Super Admin is exempt from this restriction and sees every type.
    private const VET_ONLY_TYPES = ['Vaccine Request', 'Blood Test Request'];

    private function isSuperAdmin(): bool
    {
        return Auth::user()?->role === 'super_admin';
    }

    public function index(Request $request)
    {
        $query = ServiceRequest::with(['farm', 'requestedBy', 'acceptedBy']);

        if (!$this->isSuperAdmin()) {
            $query->whereNotIn('service_type', self::VET_ONLY_TYPES);
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->service_type) {
            $query->where('service_type', $request->service_type);
        }

        // Oldest first (default) or newest first — the only two sort
        // modes exposed on the frontend.
        if ($request->sort === 'newest') {
            $query->latest();
        } else {
            $query->oldest();
        }

        $requests = $query->get()->map(fn($r) => [
            'id'              => $r->id,
            'request_number'  => $r->request_number,
            'farm_name'       => $r->farm->farm_name,
            'farm_owner_name' => $r->requestedBy->first_name . ' ' . $r->requestedBy->last_name,
            'requested_by'    => $r->requestedBy->first_name . ' ' . $r->requestedBy->last_name,
            'accepted_by'     => $r->acceptedBy ? $r->acceptedBy->first_name . ' ' . $r->acceptedBy->last_name : null,
            'service_type'    => $r->service_type,
            'barangay'        => $r->farm->barangay,
            'farm_size'       => $r->farm->farm_size,
            'notes'           => $r->notes,
            'status'          => $r->status,
            'priority'        => $r->priority,
            'scheduled_at'    => $r->scheduled_at,
            'previous_scheduled_at' => $r->previous_scheduled_at,
            'reschedule_reason'     => $r->reschedule_reason,
            'completed_at'    => $r->completed_at,
            'created_at'      => $r->created_at,
        ]);

        return response()->json(['success' => true, 'data' => $requests]);
    }

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

    private function guardAgainstVetOnly(ServiceRequest $sr): ?\Illuminate\Http\JsonResponse
    {
        if ($this->isSuperAdmin()) {
            return null;
        }

        if (in_array($sr->service_type, self::VET_ONLY_TYPES, true)) {
            return response()->json([
                'success' => false,
                'message' => 'This request type is managed by the Veterinarian, not the Administrator.',
            ], 403);
        }
        return null;
    }

    public function accept(Request $request, int $id)
    {
        $request->validate([
            'scheduled_at' => 'required|date',
            'notes'        => 'nullable|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);
        if ($blocked = $this->guardAgainstVetOnly($sr)) return $blocked;

        $sr->update([
            'status'       => 'Scheduled',
            'scheduled_at' => $request->scheduled_at,
            'accepted_by'  => Auth::id(),
            'notes'        => $request->notes ?? $sr->notes,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Scheduled Service Request',
            'details' => "{$sr->service_type} — {$sr->farm->farm_name}",
            'type'    => 'Service',
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Scheduled',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" has been scheduled."
        );

        return response()->json(['success' => true, 'message' => 'Request scheduled.']);
    }

    public function decline(int $id)
    {
        $sr = ServiceRequest::findOrFail($id);
        if ($blocked = $this->guardAgainstVetOnly($sr)) return $blocked;

        $sr->update(['status' => 'Cancelled']);

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
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" was declined."
        );

        return response()->json(['success' => true, 'message' => 'Request declined.']);
    }

    public function complete(Request $request, int $id)
    {
        $request->validate([
            'notes' => 'nullable|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);
        if ($blocked = $this->guardAgainstVetOnly($sr)) return $blocked;

        $sr->update([
            'status'       => 'Completed',
            'completed_at' => now(),
            'notes'        => $request->notes ?? $sr->notes,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Completed Service Request',
            'details' => "{$sr->service_type} — {$sr->farm->farm_name}",
            'type'    => 'Service',
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Completed',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" has been completed."
        );

        return response()->json(['success' => true, 'message' => 'Marked as completed.']);
    }

    /**
     * For a scheduled visit that didn't happen — moves the date/time
     * forward, keeps the request active (never touches status), and keeps
     * a record of what the previous schedule was and why it changed.
     * Mirrors Vet\VaccinationRequestController::reschedule() for its own
     * (Odor/Fly Control) request types — separate endpoint, separate
     * permission guard, same shared service_requests columns.
     */
    public function reschedule(Request $request, int $id)
    {
        $request->validate([
            'scheduled_at' => 'required|date',
            'reason'       => 'required|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);
        if ($blocked = $this->guardAgainstVetOnly($sr)) return $blocked;

        $sr->update([
            'previous_scheduled_at' => $sr->scheduled_at,
            'scheduled_at'          => $request->scheduled_at,
            'reschedule_reason'     => $request->reason,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Rescheduled Service Request',
            'details' => "{$sr->service_type} — {$sr->farm->farm_name}",
            'type'    => 'Service',
        ]);

        return response()->json(['success' => true, 'message' => 'Request rescheduled.']);
    }

    public function cancel(int $id)
    {
        $sr = ServiceRequest::findOrFail($id);
        if ($blocked = $this->guardAgainstVetOnly($sr)) return $blocked;

        $sr->update(['status' => 'Cancelled']);

        return response()->json(['success' => true, 'message' => 'Request cancelled.']);
    }
}