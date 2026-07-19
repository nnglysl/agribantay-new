<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use Illuminate\Support\Facades\Auth;

class ReportController extends Controller
{
    // Both service types the Vet actually handles — mirrors
    // ServiceRequestController's VET_ONLY_TYPES on the admin side.
    // Previously this only ever looked at Vaccine Request, silently
    // dropping every Blood Test Request from every report.
    private const VET_SERVICE_TYPES = ['Vaccine Request', 'Blood Test Request'];

    public function index()
    {
        // A regular Vet only ever sees their own assigned work —
        // unchanged. Super Admin sees every vet's data combined, since
        // they're not personally assigned anything themselves; filtering
        // by their own Auth::id() would silently return zero rows
        // instead of the "all vets" view they actually need.
        $isSuperAdmin = Auth::user()->role === 'super_admin';

        $baseQuery = function () use ($isSuperAdmin) {
            $q = ServiceRequest::whereIn('service_type', self::VET_SERVICE_TYPES);
            if (!$isSuperAdmin) {
                $q->where('assigned_to', Auth::id());
            }
            return $q;
        };

        $totalCompleted = $baseQuery()->where('status', 'Completed')->count();

        $farmsCovered = $baseQuery()->where('status', 'Completed')->distinct('farm_id')->count('farm_id');

        $completedServices = $baseQuery()
            ->with(['farm', 'assignedTo'])
            ->where('status', 'Completed')
            ->latest('completed_at')
            ->get()
            ->map(fn($r) => [
                'id'           => $r->request_number,
                'service_type' => $r->service_type,
                'farm_name'    => $r->farm->farm_name,
                'owner_name'   => $r->farm->owner_name,
                'barangay'     => $r->farm->barangay,
                'farm_size'    => $r->farm->farm_size,
                'completed_at' => $r->completed_at?->format('M d, Y'),
                'notes'        => $r->notes,
                'status'       => $r->status,
                // Only meaningful/shown when viewed by Super Admin, since
                // a regular Vet's own report is implicitly all their own.
                'vet_name'     => $isSuperAdmin
                    ? trim(($r->assignedTo->first_name ?? '') . ' ' . ($r->assignedTo->last_name ?? ''))
                    : null,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'total_completed'    => $totalCompleted,
                'farms_covered'      => $farmsCovered,
                'completed_services' => $completedServices,
            ],
        ]);
    }
}