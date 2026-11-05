<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Models\ServiceRequest;
use App\Models\ActivityLog;
use App\Models\Notification;
use App\Models\User;
use App\Services\SuperAdminNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Support\ServiceTypes;
use App\Http\Controllers\Vet\VaccinationRequestController;
use Illuminate\Validation\Rule;

class ServiceRequestController extends Controller
{
    use ResolvesFarm;

    private const VET_ONLY_TYPES = ServiceTypes::VET;

    public function index(Request $request)
    {
        \App\Support\TableQuery::validate($request);
        $farm = $this->resolveFarmOrFail($request);

        $query = ServiceRequest::with(['acceptedBy', 'attachments.uploader'])
            ->where('farm_id', $farm->id)
            // Apply before tab/filter counts: even a crafted legacy tab cannot
            // reveal retired requests through the Farmer endpoint.
            ->whereIn('service_type', ServiceTypes::VET);
        \App\Support\TableFilters::requests($query, $request, 'desc');
        $requests = \App\Support\TableQuery::rows($query, $request)->map(fn($r) => [
                'id'             => $r->id,
                'request_number' => $r->request_number,
                'service_type'   => $r->service_type,
                'is_retired'     => ServiceTypes::isRetired($r->service_type),
                'notes'          => $r->notes,
                'completion_notes' => $r->completion_notes,
                ...VaccinationRequestController::attachmentPayload($r),
                'status'         => $r->status,
                'priority'       => $r->priority,
                'accepted_by'    => $r->acceptedBy ? $r->acceptedBy->first_name . ' ' . $r->acceptedBy->last_name : null,
                'scheduled_at'   => $r->scheduled_at,
                'completed_at'   => $r->completed_at,
                'decline_reason' => $r->decline_reason,
                'created_at'     => $r->created_at,
            ]);

        if ($request->filled('per_page')) return response()->json(['success' => true, 'data' => \App\Support\TableQuery::payload($request, $requests)]);

        return response()->json([
            'success' => true,
            'data' => [
                'active' => $requests->where('is_retired', false)->whereIn('status', ['Pending', 'Scheduled'])->values(),
                'past'   => $requests->where('is_retired', false)->whereIn('status', ['Completed', 'Cancelled'])->values(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $farm = $this->resolveFarmOrFail($request);

        if (is_string($request->service_type) && ServiceTypes::isRetired($request->service_type)) {
            return response()->json(['success' => false, 'message' => 'Odor/Fly service requests are retired. Submit a farm Control Document instead.',
                'errors' => ['service_type' => ['This service request type is retired.']]], 422);
        }

        // Only the current Farmer-requestable Vet services are accepted.
        $request->validate([
            'service_type' => ['required', Rule::in(ServiceTypes::REQUESTABLE)],
            'notes'        => 'nullable|string',
        ]);

        $hasActiveRequest = ServiceRequest::where('farm_id', $farm->id)
            ->where('service_type', $request->service_type)
            ->whereIn('status', ['Pending', 'Scheduled'])
            ->exists();

        if ($hasActiveRequest) {
            return response()->json([
                'success' => false,
                'message' => "You already have an active {$request->service_type} request. Please wait until it is completed or cancelled before submitting another.",
            ], 422);
        }

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

        // Vaccine/Blood Test requests are handled exclusively by Vets;
        // accept each type, so nobody gets notified about a request they
        // have no way to act on.
        $isVetOnly = in_array($request->service_type, self::VET_ONLY_TYPES, true);
        $recipients = User::where('role', $isVetOnly ? 'vet' : 'admin')
            ->where('status', 'active')
            ->get();

        $recipientLink = $isVetOnly ? '/vet/vaccination-requests' : '/admin/service-requests';

        foreach ($recipients as $recipient) {
            Notification::create([
                'user_id' => $recipient->id,
                'title'   => 'New Service Request',
                'message' => "New {$request->service_type} from \"{$farm->farm_name}\" ({$farm->owner_name}).",
                'type'    => 'Request Update',
                'link'    => $recipientLink,
                'is_read' => false,
            ]);
        }

        // Super Admin oversight copy (same event, separate recipient).
        SuperAdminNotifier::notify(
            'New Service Request',
            "New {$request->service_type} from \"{$farm->farm_name}\" ({$farm->owner_name}).",
            'Request Update',
            '/superadmin/service-requests'
        );

        return response()->json([
            'success' => true,
            'message' => 'Service request submitted.',
            'data'    => $serviceRequest,
        ]);
    }
}
