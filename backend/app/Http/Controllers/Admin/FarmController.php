<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\User;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
class FarmController extends Controller
{
    public function index(Request $request)
    {
        $query = Farm::with(['user', 'sensorReadings' => function ($q) {
            $q->latest()->limit(1);
        }]);

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->barangay) {
            $query->where('barangay', $request->barangay);
        }

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('farm_name', 'like', "%{$request->search}%")
                  ->orWhere('owner_name', 'like', "%{$request->search}%");
            });
        }

        $farms = $query->latest()->get()->map(function ($farm) {
            $latestReading = $farm->sensorReadings->first();
            return [
                'id'          => $farm->id,
                'farm_name'   => $farm->farm_name,
                'owner_name'  => $farm->owner_name,
                'mobile_number' => $farm->mobile_number,
                'barangay'    => $farm->barangay,
                'address'     => $farm->address,
                'num_birds'   => $farm->num_birds,
                'farm_size'   => $farm->farm_size,
                'status'      => $farm->status,
                'ammonia'     => $latestReading?->ammonia,
                'ammonia_status' => $latestReading?->ammonia_status,
                'sensor_status'  => $latestReading?->ammonia_status ?? 'Offline',
            ];
        });

        return response()->json(['success' => true, 'data' => $farms]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'first_name'    => 'required|string',
            'last_name'     => 'required|string',
            'mobile_number' => 'required|string',
            'farm_name'     => 'required|string',
            'barangay'      => 'required|string',
            'farm_size'     => 'required|in:Small,Semi-Commercial,Commercial',
        ]);

        $tempPassword = 'password';
        $user = User::create([
            'first_name'    => $request->first_name,
            'last_name'     => $request->last_name,
            'email'         => strtolower($request->first_name . '.' . $request->last_name) . '@agribantay.gov.ph',
            'mobile_number' => $request->mobile_number,
            'password'      => bcrypt($tempPassword),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        $farm = Farm::create([
            'user_id'       => $user->id,
            'farm_name'     => $request->farm_name,
            'owner_name'    => $user->first_name . ' ' . $user->last_name,
            'mobile_number' => $request->mobile_number,
            'barangay'      => $request->barangay,
            'farm_size'     => $request->farm_size,
            'status'        => 'Active',
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Created Farm Owner Account',
            'details' => "Created account for {$user->first_name} {$user->last_name} — {$farm->farm_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Farm owner and farm created successfully.',
            'data'    => ['user' => $user, 'farm' => $farm],
        ]);
    }

    public function show(int $id)
    {
        $farm = Farm::with(['user', 'poultryHouses', 'sensorReadings' => function ($q) {
            $q->latest()->limit(1);
        }])->findOrFail($id);

        return response()->json(['success' => true, 'data' => $farm]);
    }

    public function update(Request $request, int $id)
    {
        $farm = Farm::findOrFail($id);

        $request->validate([
            'first_name'    => 'sometimes|string',
            'last_name'     => 'sometimes|string',
            'mobile_number' => 'sometimes|string',
            'farm_name'     => 'sometimes|string',
            'barangay'      => 'sometimes|string',
            'farm_size'     => 'sometimes|in:Small,Semi-Commercial,Commercial',
        ]);

        $farm->update($request->only([
            'farm_name', 'barangay', 'farm_size', 'mobile_number',
        ]));

        if ($request->first_name || $request->last_name) {
            $farm->user->update([
                'first_name'    => $request->first_name ?? $farm->user->first_name,
                'last_name'     => $request->last_name ?? $farm->user->last_name,
                'mobile_number' => $request->mobile_number ?? $farm->user->mobile_number,
            ]);
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Updated Farm',
            'details' => "Updated farm: {$farm->farm_name}",
            'type'    => 'Farm',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Farm updated successfully.',
            'data'    => $farm,
        ]);
    }

    public function deactivate(int $id)
    {
        $farm = Farm::findOrFail($id);
        $farm->update(['status' => 'Deactivated']);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Deactivated Farm',
            'details' => "Deactivated farm: {$farm->farm_name}",
            'type'    => 'Farm',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Farm deactivated.',
        ]);
    }

    public function activate(int $id)
    {
        $farm = Farm::findOrFail($id);
        $farm->update(['status' => 'Active']);

        return response()->json([
            'success' => true,
            'message' => 'Farm activated.',
        ]);
    }
}