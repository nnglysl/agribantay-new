<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Models\MaintenanceLog;
use App\Services\MaintenanceStatusService;
use Illuminate\Http\Request;

class MaintenanceController extends Controller
{
    use ResolvesFarm;

    public function index(Request $request)
    {
        $farm = $this->resolveFarm($request);

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'No farm found for this account.'], 404);
        }

        $status = app(MaintenanceStatusService::class)->getStatus($farm);

        $recentLogs = MaintenanceLog::where('farm_id', $farm->id)
            ->latest('performed_at')->orderByDesc('id')
            ->limit(5)
            ->get()
            ->map(fn($log) => [
                'id'           => $log->id,
                'maintenance_type' => $log->maintenance_type,
                'performed_at' => $log->performed_at->format('M d, Y'),
                'notes'        => $log->notes,
                'photo_url'    => asset('storage/' . $log->photo_path),
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'farm_id'      => $farm->id,
                'status'       => $status,
                'recent_logs'  => $recentLogs,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $farm = $this->resolveFarm($request);

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'No farm found for this account.'], 404);
        }

        $registrationDate = app(MaintenanceStatusService::class)->getStatus($farm)['registration_date_raw'];
        $request->validate([
            'maintenance_type' => ['sometimes', 'required', \Illuminate\Validation\Rule::in([MaintenanceStatusService::FULL_CLEANOUT])],
            'performed_at' => array_filter(['required', 'date_format:Y-m-d', 'before_or_equal:'.now('Asia/Manila')->toDateString(),
                $registrationDate ? 'after_or_equal:'.$registrationDate : null]),
            'notes'        => 'nullable|string|max:1000',
            // Required — no photo, no log. Reasonable size cap for
            // shared hosting storage.
            'photo'        => 'required|image|max:5120',
        ]);

        $photoPath = $request->file('photo')->store('maintenance', 'public');

        $log = MaintenanceLog::create([
            'farm_id'          => $farm->id,
            'maintenance_type' => MaintenanceStatusService::FULL_CLEANOUT,
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
