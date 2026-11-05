<?php

namespace App\Http\Controllers;

use App\Services\PoultryHouseService;
use Illuminate\Http\Request;

class PoultryHouseController extends Controller
{
    public function index(Request $request, int $farmId, PoultryHouseService $houses)
    {
        return response()->json(['success' => true, 'data' => $houses->listing($request->user(), $farmId)]);
    }

    public function store(Request $request, int $farmId, PoultryHouseService $houses)
    {
        $data = $request->validate(['request_id' => 'required|uuid', 'count' => 'nullable|integer|min:1|max:100', 'name' => 'prohibited',
            'house_number' => 'prohibited', 'farm_id' => 'prohibited', 'status' => 'prohibited', 'device_id' => 'prohibited']);
        $result = $houses->add($request->user(), $farmId, $data['request_id'], $data['count'] ?? 1);

        return response()->json(['success' => true, 'data' => $result], $result['replayed'] ? 200 : 201);
    }

    public function deactivate(Request $request, int $farmId, int $houseId, PoultryHouseService $houses)
    {
        return response()->json(['success' => true, 'data' => $houses->transition($request->user(), $farmId, $houseId, 'Inactive')]);
    }

    public function reactivate(Request $request, int $farmId, int $houseId, PoultryHouseService $houses)
    {
        return response()->json(['success' => true, 'data' => $houses->transition($request->user(), $farmId, $houseId, 'Active')]);
    }
}
