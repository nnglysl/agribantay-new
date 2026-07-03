<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use Illuminate\Support\Facades\Auth;

class ReportController extends Controller
{
    public function index()
    {
        $vetId = Auth::id();

        $baseQuery = fn() => ServiceRequest::where('assigned_to', $vetId)
            ->where('service_type', 'Vaccine Request');

        $totalVaccinations = $baseQuery()->where('status', 'Completed')->count();

        $farmsCovered = $baseQuery()->distinct('farm_id')->count('farm_id');

        $completedVaccinations = $baseQuery()
            ->with('farm')
            ->where('status', 'Completed')
            ->latest('completed_at')
            ->get()
            ->map(fn($r) => [
                'id'           => $r->request_number,
                'farm_name'    => $r->farm->farm_name,
                'owner_name'   => $r->farm->owner_name,
                'barangay'     => $r->farm->barangay,
                'num_birds'    => $r->farm->num_birds,
                'completed_at' => $r->completed_at?->format('M d, Y'),
                'notes'        => $r->notes,
                'status'       => $r->status,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'total_vaccinations'     => $totalVaccinations,
                'farms_covered'          => $farmsCovered,
                'completed_vaccinations' => $completedVaccinations,
            ],
        ]);
    }
}