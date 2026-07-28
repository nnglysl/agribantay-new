<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Farm;
use App\Models\ActivityLog;
use App\Services\SmsService;
use App\Mail\TempPasswordMail;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;

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
                  ->orWhere('mobile_number', 'like', "%{$s}%")
                  ->orWhere('email', 'like', "%{$s}%");
            });
        }

        $owners = $query->orderBy('first_name')->limit(20)->get();

        $owners = $owners->map(function ($owner) {
            return [
                'id'             => $owner->id,
                'first_name'     => $owner->first_name,
                'last_name'      => $owner->last_name,
                'mobile_number'  => $owner->mobile_number,
                'email'          => $owner->email,
                'farm_count'     => Farm::where('user_id', $owner->id)->count(),
            ];
        });

        return response()->json(['success' => true, 'data' => $owners]);
    }

    /**
     * Step 1 of registration: create the owner account only.
     * Farms are attached afterward via FarmController::store()
     * using the returned user id as farm_owner_id.
     *
     * Accepts a single 'contact' field — either an email or a mobile
     * number — same detection pattern as Login. Whichever type is
     * entered determines both which column it's stored in AND which
     * channel (email vs SMS) delivers the temporary password.
     */
    public function store(Request $request)
    {
        $request->validate([
            'first_name' => 'required|string',
            'last_name'  => 'required|string',
            'contact'    => 'required|string',
            'address'    => 'nullable|string',
        ]);

        $isEmail = filter_var($request->contact, FILTER_VALIDATE_EMAIL);

        // Manual uniqueness check since which column to check depends on
        // the detected contact type.
        $exists = $isEmail
            ? User::where('email', $request->contact)->exists()
            : User::where('mobile_number', $request->contact)->exists();

        if ($exists) {
            return response()->json([
                'success' => false,
                'message' => $isEmail
                    ? 'An account with this email already exists.'
                    : 'An account with this mobile number already exists.',
            ], 422);
        }

        $tempPassword = Str::random(10);

        $user = User::create([
            'first_name'           => $request->first_name,
            'last_name'            => $request->last_name,
            'email'                => $isEmail ? $request->contact : null,
            'mobile_number'        => $isEmail ? null : $request->contact,
            'address'              => $request->address,
            'password'             => bcrypt($tempPassword),
            'role'                 => 'farm_owner',
            'status'               => 'active',
            'must_change_password' => true,
        ]);

        $delivered = false;

        if ($isEmail) {
            try {
                Mail::to($user->email)->send(new TempPasswordMail($user, $tempPassword, 'welcome'));
                $delivered = true;
            } catch (\Throwable $e) {
                report($e);
            }
        } else {
            $smsMessage = "Welcome to AgriBantay, {$request->first_name}! Your account is ready. Temporary password: {$tempPassword}. You will be asked to set a new password on your first visit to the AgriBantay portal.";

            $delivered = app(SmsService::class)->send(
                $request->contact,
                $smsMessage,
                'Account Creation',
                $user->id
            );
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Created Farm Owner Account',
            'details' => "Created owner account for {$user->first_name} {$user->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'   => true,
            'message'   => 'Farm owner registered successfully.',
            'id'        => $user->id,
            'delivered' => $delivered,
            'data'      => $user,
        ]);
    }
}