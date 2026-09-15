<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Models\Inspection;
use Illuminate\Http\Request;

class InspectionController extends Controller
{
    use ResolvesFarm;

    public function index(Request $request)
    {
        $farm = $this->resolveFarmOrFail($request);

        $inspections = Inspection::with(['assignedTo', 'scheduledBy'])
            ->where('farm_id', $farm->id)
            ->orderByDesc('scheduled_at')
            ->get()
            ->map(fn($i) => [
                'id'                => $i->id,
                'inspection_number' => $i->inspection_number,
                'inspection_type'   => $i->inspection_type,
                'status'            => $i->status,
                'scheduled_at'      => $i->scheduled_at,
                'previous_scheduled_at' => $i->previous_scheduled_at,
                'reschedule_reason' => $i->reschedule_reason,
                'assigned_to'       => $i->assignedTo ? $i->assignedTo->first_name . ' ' . $i->assignedTo->last_name : null,
                'scheduled_by'      => $i->scheduledBy ? $i->scheduledBy->first_name . ' ' . $i->scheduledBy->last_name : null,
                'notes'             => $i->notes,
                'findings'          => $i->findings,
                'completed_at'      => $i->completed_at,
                'created_at'        => $i->created_at,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'upcoming' => $inspections->where('status', 'Scheduled')->values(),
                'past'     => $inspections->whereIn('status', ['Completed', 'Cancelled'])->values(),
            ],
        ]);
    }
}
