<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\MaintenanceLog;
use App\Services\MaintenanceStatusService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class MaintenanceController extends Controller
{
    /**
     * Same "one farm per owner" assumption used by InsightController and
     * the rest of the Farmer-side pages.
     */
    private function resolveFarm(): ?Farm
    {
        return Farm::where('user_id', Auth::id())->first();
    }

    public function index()
    {
        $farm = $this->resolveFarm();

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'No farm found for this account.'], 404);
        }

        $status = app(MaintenanceStatusService::class)->getStatus($farm);

        $recentLogs = MaintenanceLog::where('farm_id', $farm->id)
            ->latest('performed_at')
            ->limit(5)
            ->get()
            ->map(fn($log) => [
                'id'           => $log->id,
                'performed_at' => $log->performed_at->format('M d, Y'),
                'notes'        => $log->notes,
                'photo_url'    => asset('storage/' . $log->photo_path),
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'status'       => $status,
                'recent_logs'  => $recentLogs,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $farm = $this->resolveFarm();

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'No farm found for this account.'], 404);
        }

        $request->validate([
            'performed_at' => 'required|date|before_or_equal:today',
            'notes'        => 'nullable|string|max:1000',
            // Required — no photo, no log. Reasonable size cap for
            // shared hosting storage.
            'photo'        => 'required|image|max:5120',
        ]);

        $photoPath = $request->file('photo')->store('maintenance', 'public');

        $log = MaintenanceLog::create([
            'farm_id'          => $farm->id,
            'maintenance_type' => 'Full Manure Clean-out',
            'performed_at'     => $request->performed_at,
            'notes'            => $request->notes,
            'photo_path'       => $photoPath,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Clean-out logged successfully.',
            'data'    => $log,
        ]);
    }
}