<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function index()
    {
        $vetId = Auth::id();

        $baseQuery = fn() => ServiceRequest::where('assigned_to', $vetId)
            ->whereIn('service_type', ['Vaccine Request', 'Blood Test Request']);

        $assignedRequests = $baseQuery()->count();

        $todaysSchedule = $baseQuery()
            ->whereDate('scheduled_at', now()->toDateString())
            ->count();

        $pending = ServiceRequest::whereIn('service_type', ['Vaccine Request', 'Blood Test Request'])
            ->where('status', 'Pending')
            ->whereNull('assigned_to')
            ->count();

        $completed = $baseQuery()->where('status', 'Completed')->count();

        $scheduledVaccinations = $baseQuery()
            ->with('farm')
            ->where('status', 'Scheduled')
            ->orderBy('scheduled_at')
            ->take(5)
            ->get()
            ->map(fn($r) => [
                'id'             => $r->id,
                'request_number' => $r->request_number,
                'farm_name'      => $r->farm->farm_name,
                'owner_name'     => $r->farm->owner_name,
                'scheduled_at'   => $r->scheduled_at,
                'status'         => $r->status,
            ]);

        $recentRequests = $baseQuery()
            ->with('farm')
            ->where('status', 'Completed')
            ->orderByDesc('completed_at')
            ->take(5)
            ->get()
            ->map(fn($r) => [
                'id'           => $r->id,
                'farm_name'    => $r->farm->farm_name,
                'completed_at' => $r->completed_at,
                'status'       => $r->status,
            ]);

        $assignedFarms = $baseQuery()
            ->with('farm')
            ->get()
            ->pluck('farm')
            ->filter()
            ->unique('id')
            ->values()
            ->map(fn($farm) => [
                'id'        => $farm->id,
                'farm_name' => $farm->farm_name,
                'barangay'  => $farm->barangay,
            ]);

        // Monthly vaccination progress — last 6 months, count of completed per month
        $monthlyProgress = [];
        for ($i = 5; $i >= 0; $i--) {
            $month = now()->subMonths($i);
            $count = $baseQuery()
                ->where('status', 'Completed')
                ->whereYear('completed_at', $month->year)
                ->whereMonth('completed_at', $month->month)
                ->count();

            $monthlyProgress[] = [
                'month' => $month->format('M'),
                'count' => $count,
            ];
        }

        // Feeds the dashboard map: every Scheduled request assigned to this vet,
        // across both service types (Vaccine + Blood Test — the two types vets
        // actually handle). Only Scheduled requests are included, since those
        // are the only ones with a confirmed date and a farm worth plotting;
        // Pending requests don't have a scheduled_at yet. Farm coordinates are
        // included here since neither scheduledVaccinations nor assignedFarms
        // carry them.
        $mapRequests = ServiceRequest::where('assigned_to', $vetId)
            ->whereIn('service_type', ['Vaccine Request', 'Blood Test Request'])
            ->where('status', 'Scheduled')
            ->with('farm')
            ->orderBy('scheduled_at')
            ->get()
            ->filter(fn($r) => $r->farm && $r->farm->latitude && $r->farm->longitude)
            ->map(fn($r) => [
                'id'             => $r->id,
                'request_number' => $r->request_number,
                'service_type'   => $r->service_type,
                'farm_id'        => $r->farm->id,
                'farm_name'      => $r->farm->farm_name,
                'owner_name'     => $r->farm->owner_name,
                'latitude'       => (float) $r->farm->latitude,
                'longitude'      => (float) $r->farm->longitude,
                'scheduled_at'   => $r->scheduled_at,
            ])
            ->values();

        return response()->json([
            'success' => true,
            'data' => [
                'assigned_requests'      => $assignedRequests,
                'todays_schedule'        => $todaysSchedule,
                'pending'                => $pending,
                'completed'              => $completed,
                'scheduled_vaccinations' => $scheduledVaccinations,
                'recent_requests'        => $recentRequests,
                'assigned_farms'         => $assignedFarms,
                'monthly_progress'       => $monthlyProgress,
                'map_requests'           => $mapRequests,
            ],
        ]);
    }
}