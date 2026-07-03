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
            ->where('service_type', 'Vaccine Request');

        $assignedRequests = $baseQuery()->count();

        $todaysSchedule = $baseQuery()
            ->whereDate('scheduled_at', now()->toDateString())
            ->count();

        $pending = ServiceRequest::where('service_type', 'Vaccine Request')
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

        $farmsCovered = $baseQuery()->distinct('farm_id')->count('farm_id');

        $vaccinationsThisMonth = $baseQuery()
            ->where('status', 'Completed')
            ->whereYear('completed_at', now()->year)
            ->whereMonth('completed_at', now()->month)
            ->count();

        $pendingRequests = $baseQuery()->where('status', 'Pending')->count();

        return response()->json([
            'success' => true,
            'data' => [
                'assigned_requests'      => $assignedRequests,
                'todays_schedule'        => $todaysSchedule,
                'pending'                => $pending,
                'completed'              => $completed,
                'scheduled_vaccinations' => $scheduledVaccinations,
                'monthly_progress'       => $monthlyProgress,
                'farms_covered' => [
                    'total_farms_served'     => $farmsCovered,
                    'vaccinations_this_month'=> $vaccinationsThisMonth,
                    'pending_requests'       => $pendingRequests,
                ],
            ],
        ]);
    }
}