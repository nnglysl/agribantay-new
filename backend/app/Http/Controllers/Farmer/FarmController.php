<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Services\FarmStatusService;
use Illuminate\Support\Facades\Auth;

class FarmController extends Controller
{
    /**
     * Every farm this account owns — backs the farm selector shown across
     * the Farmer pages and the "My Farms" list. Scoped strictly to
     * user_id = Auth::id(), same as every other Farmer endpoint, so this
     * can never leak another owner's farms.
     */
    public function index()
    {
        $farms = Farm::where('user_id', Auth::id())
            ->with('sensors')
            ->orderBy('id')
            ->get();

        $service = app(FarmStatusService::class);

        $data = $farms->map(fn($farm) => [
            'id'           => $farm->id,
            'farm_name'    => $farm->farm_name,
            'barangay'     => $farm->barangay,
            'municipality' => $farm->municipality,
            // Settings → Farm Information reads these for the selected farm.
            'address'      => $farm->address,
            'farm_size'    => $farm->farm_size,
            'status'       => $service->displayStatus($farm),
            'has_device'   => $service->hasActiveDevice($farm),
        ]);

        return response()->json(['success' => true, 'data' => $data]);
    }
}
