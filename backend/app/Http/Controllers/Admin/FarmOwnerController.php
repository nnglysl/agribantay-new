<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Farm;
use App\Models\ActivityLog;
use App\Services\SmsService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;

class FarmOwnerController extends Controller
{
    /**
     * Search existing farm owners — used by the "Add Farm to Existing
     * Owner" flow so an owner is never registered twice.
     */
    public function index(Request $request)
    {
        $query = User::where('role', 'farm_owner');

        if ($request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('first_name', 'like', "%{$s}%")
                  ->orWhere('last_name', 'like', "%{$s}%")
                  ->orWhere('mobile_number', 'like', "%{$s}%");
            });
        }

        $owners = $query->orderBy('first_name')->limit(20)->get();

        $owners = $owners->map(function ($owner) {
            return [
                'id'             => $owner->id,
                'first_name'     => $owner->first_name,
                'last_name'      => $owner->last_name,
                'mobile_number'  => $owner->mobile_number,
                'farm_count'     => Farm::where('user_id', $owner->id)->count(),
            ];
        });

        return response()->json(['success' => true, 'data' => $owners]);
    }

    /**
     * Step 1 of registration: create the owner account only.
     * Farms are attached afterward via FarmController::store()
     * using the returned user id as farm_owner_id.
     */
    public function store(Request $request)
    {
        $request->validate([
            'first_name'    => 'required|string',
            'last_name'     => 'required|string',
            'mobile_number' => 'required|string|unique:users,mobile_number',
            'address'       => 'nullable|string',
        ]);

        $tempPassword = Str::random(10);

        $user = User::create([
            'first_name'           => $request->first_name,
            'last_name'            => $request->last_name,
            'mobile_number'        => $request->mobile_number,
            'address'               => $request->address,
            'password'             => bcrypt($tempPassword),
            'role'                 => 'farm_owner',
            'status'               => 'active',
            'must_change_password' => true,
        ]);

        $smsMessage = "Welcome to AgriBantay, {$request->first_name}! Your account is ready. Temporary password: {$tempPassword}. You will be asked to set a new password on your first visit to the AgriBantay portal.";

        $smsSent = app(SmsService::class)->send(
            $request->mobile_number,
            $smsMessage,
            'Account Creation',
            $user->id
        );

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Created Farm Owner Account',
            'details' => "Created owner account for {$user->first_name} {$user->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'  => true,
            'message'  => 'Farm owner registered successfully.',
            'id'       => $user->id,
            'sms_sent' => $smsSent,
            'data'     => $user,
        ]);
    }
}