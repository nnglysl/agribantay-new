<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class FarmOwnerController extends Controller
{
    private function authorizeManagement(Request $request): void
    {
        abort_unless(in_array($request->user()?->role, ['admin', 'super_admin'], true), 403,
            'Only Staff and Super Admin may manage farm owner accounts.');
    }

    public function index(Request $request)
    {
        $this->authorizeManagement($request);

        \App\Support\TableQuery::validate($request);
        $query = User::where('role', 'farm_owner');

        if ($request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('first_name', 'like', "%{$s}%")
                  ->orWhere('last_name', 'like', "%{$s}%")
                  ->orWhereRaw(\App\Support\TableFilters::fullName($q).' LIKE ?', ["%{$s}%"])
                  ->orWhere('mobile_number', 'like', "%{$s}%")
                  ->orWhere('email', 'like', "%{$s}%");
            });
        }

        $owners = $query->withCount('farms')->orderBy('first_name')->orderBy('id')->limit(20)->get();

        $owners = $owners->map(function ($owner) {
            return [
                'id'                => $owner->id,
                'first_name'        => $owner->first_name,
                'last_name'         => $owner->last_name,
                'mobile_number'     => $owner->mobile_number,
                'email'             => $owner->email,
                'profile_photo_url' => $owner->profile_photo_path ? asset('storage/' . $owner->profile_photo_path) : null,
                'farm_count'        => $owner->farms_count,
            ];
        });

        return response()->json(['success' => true, 'data' => $owners]);
    }

    public function validateOwner(Request $request)
    {
        $this->authorizeManagement($request);
        app(\App\Services\FarmRegistrationService::class)->validateOwner($request);
        return response()->json(['success' => true, 'message' => 'Owner details validated. Complete the farms to finish registration.']);
    }

    public function store(Request $request)
    {
        $this->authorizeManagement($request);
        $result = app(\App\Services\FarmRegistrationService::class)->register($request, true);
        return response()->json([
            'success' => true, 'message' => 'Farm owner and farms registered successfully.',
            'id' => $result['user']->id, 'data' => $result['user'], 'farms' => $result['farms'],
            'delivered' => $result['delivered'], 'contact_method' => $result['contact_method'],
            'delivery_pending' => $result['delivery_pending'],
        ]);
    }
}
