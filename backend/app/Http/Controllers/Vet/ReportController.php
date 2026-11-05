<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Support\LocalTime;
use App\Support\ReportPeriod;
use App\Support\ServiceTypes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ReportController extends Controller
{
    private const VET_SERVICE_TYPES = ServiceTypes::VET;

    public function index(Request $request)
    {
        $period = ReportPeriod::fromRequest($request);
        $isSuperAdmin = Auth::user()->role === 'super_admin';

        $baseQuery = function () use ($isSuperAdmin, $period) {
            $q = ServiceRequest::whereIn('service_type', self::VET_SERVICE_TYPES);
            if (! $isSuperAdmin) {
                $q->where('accepted_by', Auth::id());
            }

            return $period->scope($q, ReportPeriod::SERVICE_DATE);
        };

        $totalCompleted = $baseQuery()->where('status', 'Completed')->count();

        $totalPending = $baseQuery()->where('status', 'Pending')->count();

        $farmsCovered = $baseQuery()->where('status', 'Completed')->distinct('farm_id')->count('farm_id');

        $completedServices = $baseQuery()
            ->with(['farm', 'acceptedBy'])
            ->where('status', 'Completed')
            ->latest('completed_at')->orderByDesc('id')
            ->get()
            ->filter(fn ($r) => $r->farm !== null)
            ->map(fn ($r) => [
                'id' => $r->request_number,
                'service_type' => $r->service_type,
                'farm_name' => $r->farm->farm_name,
                'owner_name' => $r->farm->owner_name,
                'barangay' => $r->farm->barangay,
                'farm_size' => $r->farm->farm_size,
                'completed_at' => LocalTime::date($r->completed_at),
                'completed_at_raw' => $r->completed_at?->toIso8601String(),
                'notes' => $r->notes,
                'status' => $r->status,
                // Only meaningful/shown when viewed by Super Admin, since
                // a regular Vet's own report is implicitly all their own.
                'vet_name' => $isSuperAdmin
                    ? trim(($r->acceptedBy->first_name ?? '').' '.($r->acceptedBy->last_name ?? ''))
                    : null,
            ])
            ->values();

        // Completed + Scheduled rows for Super Admin Reports (the Vet page
        // keeps using completed_services). `date_raw` is the completion date
        // for Completed rows and the scheduled date for Scheduled rows.
        $serviceRecords = $baseQuery()
            ->with(['farm', 'acceptedBy'])
            ->whereIn('status', ['Completed', 'Scheduled'])
            ->get()
            ->filter(fn ($r) => $r->farm !== null)
            ->map(function ($r) use ($isSuperAdmin) {
                $date = $r->status === 'Completed' ? $r->completed_at : $r->scheduled_at;

                return [
                    'id' => $r->request_number,
                    'service_type' => $r->service_type,
                    'farm_name' => $r->farm->farm_name,
                    'owner_name' => $r->farm->owner_name,
                    'barangay' => $r->farm->barangay,
                    'date' => LocalTime::date($date),
                    'date_raw' => $date?->toIso8601String(),
                    'status' => $r->status,
                    'vet_name' => $isSuperAdmin
                        ? trim(($r->acceptedBy->first_name ?? '').' '.($r->acceptedBy->last_name ?? ''))
                        : null,
                ];
            })
            ->sortByDesc('date_raw')
            ->values();

        return response()->json([
            'success' => true,
            'data' => [
                'report_period' => ['from' => $period->from, 'to' => $period->to],
                'total_requests' => $baseQuery()->count(),
                'total_completed' => $totalCompleted,
                'total_pending' => $totalPending,
                'farms_covered' => $farmsCovered,
                'completed_services' => $completedServices,
                'service_records' => $serviceRecords,
            ],
        ]);
    }
}
