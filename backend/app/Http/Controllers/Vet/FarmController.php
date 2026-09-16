<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;

/**
 * Read-only farm directory for the Vet role. Deliberately scoped to
 * farm/owner/location info only — no sensor readings, no current_status,
 * no maintenance/compliance data, and no edit/deactivate actions. This
 * exists so a vet can look up a farm's location/contact before or during
 * a scheduled visit, without exposing environmental monitoring data that
 * isn't relevant to their role. Compare to Admin\FarmController::index(),
 * which returns the full farm record with sensor/status data — this is
 * intentionally a much narrower subset of the same underlying data.
 */
class FarmController extends Controller
{
    public function index(Request $request)
    {
        $query = Farm::with('user')->where('status', 'Active');

        if ($request->barangay) {
            $query->where('barangay', $request->barangay);
        }

        if ($request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('farm_name', 'like', "%{$s}%")
                  ->orWhere('owner_name', 'like', "%{$s}%")
                  ->orWhere('barangay', 'like', "%{$s}%");
            });
        }

        if ($request->farm_size) {
            $query->where('farm_size', $request->farm_size);
        }

        $query->orderBy('farm_name')->orderBy('id');

        // Server-side pagination when the Farms page asks for it (per_page);
        // other callers still receive the complete list.
        $paginator = null;
        if ($request->filled('per_page')) {
            $perPage = (int) $request->per_page;
            $perPage = in_array($perPage, [10, 25, 50, 100], true) ? $perPage : 10;
            $paginator = $query->paginate($perPage, ['*'], 'page', max(1, (int) $request->input('page', 1)));
            $rows = $paginator->getCollection();
        } else {
            $rows = $query->get();
        }

        $farms = $rows->map(fn($farm) => [
            'id'                       => $farm->id,
            'farm_name'                => $farm->farm_name,
            'owner_name'               => $farm->owner_name,
            'mobile_number'            => $farm->mobile_number,
            'email'                    => $farm->user?->email,
            'barangay'                 => $farm->barangay,
            'address'                  => $farm->address,
            'farm_size'                => $farm->farm_size,
            'latitude'                 => $farm->latitude,
            'longitude'                => $farm->longitude,
            'owner_profile_photo_url'  => $farm->user?->profile_photo_path
                ? asset('storage/' . $farm->user->profile_photo_path)
                : null,
        ]);

        if ($paginator) {
            return response()->json([
                'success' => true,
                'data'    => [
                    'items'     => $farms->values(),
                    'total'     => $paginator->total(),
                    'page'      => $paginator->currentPage(),
                    'per_page'  => $paginator->perPage(),
                    'last_page' => max(1, $paginator->lastPage()),
                ],
            ]);
        }

        return response()->json(['success' => true, 'data' => $farms]);
    }

    /**
     * Same narrow, view-only subset as index() above — no sensor/monitoring
     * data, no edit/deactivate capability. Powers the Vet's read-only Farm
     * Details page.
     */
    public function show(int $id)
    {
        $farm = Farm::with('user')->where('status', 'Active')->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => [
                'id'                      => $farm->id,
                'farm_name'               => $farm->farm_name,
                'owner_name'              => $farm->owner_name,
                'mobile_number'           => $farm->mobile_number,
                'email'                   => $farm->user?->email,
                'barangay'                => $farm->barangay,
                'address'                 => $farm->address,
                'farm_size'               => $farm->farm_size,
                'status'                  => $farm->status,
                'created_at'              => $farm->created_at,
                'owner_profile_photo_url' => $farm->user?->profile_photo_path
                    ? asset('storage/' . $farm->user->profile_photo_path)
                    : null,
            ],
        ]);
    }

    /**
     * Vet only ever sees the two request types relevant to veterinary
     * services — the inverse of Admin\FarmController::VET_ONLY_TYPES.
     */
    public function serviceRequests(Request $request, int $id)
    {
        Farm::findOrFail($id);

        $perPage = min((int) $request->input('per_page', 10), 50);

        $requests = ServiceRequest::where('farm_id', $id)
            ->whereIn('service_type', ['Vaccine Request', 'Blood Test Request'])
            ->with('acceptedBy')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => [
                'requests' => $requests->getCollection()->map(fn($r) => [
                    'id'               => $r->id,
                    'request_number'   => $r->request_number,
                    'request_type'     => $r->service_type,
                    'request_date'     => $r->created_at?->format('M d, Y'),
                    'created_at'       => $r->created_at,
                    'scheduled_at'     => $r->scheduled_at,
                    'notes'            => $r->notes,
                    'status'           => $r->status,
                    'accepted_by'      => $r->acceptedBy ? $r->acceptedBy->first_name . ' ' . $r->acceptedBy->last_name : null,
                    'completed_at'     => $r->completed_at?->format('M d, Y'),
                    'completed_at_raw' => $r->completed_at,
                ]),
                'current_page' => $requests->currentPage(),
                'last_page'    => $requests->lastPage(),
                'total'        => $requests->total(),
            ],
        ]);
    }
}