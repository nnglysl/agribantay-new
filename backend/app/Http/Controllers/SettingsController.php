<?php

namespace App\Http\Controllers;

use App\Models\Farm;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class SettingsController extends Controller
{
    public function show()
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $data = [
            'first_name'    => $user->first_name,
            'last_name'     => $user->last_name,
            'mobile_number' => $user->mobile_number,
            'email'         => $user->email,
            'role'          => $user->role,
        ];

        // Farm owners also see their farm's registered address info,
        // read-only — this is maintained by the admin, not self-editable,
        // since changes here re-trigger geocoding and affect map accuracy.
        if ($user->role === 'farm_owner') {
            $farm = Farm::where('user_id', $user->id)->first();

            if ($farm) {
                $data['farm'] = [
                    'farm_name' => $farm->farm_name,
                    'barangay'  => $farm->barangay,
                    'address'   => $farm->address,
                    'farm_size' => $farm->farm_size,
                ];
            }
        }

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function updateProfile(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $request->validate([
            'first_name'    => 'required|string',
            'last_name'     => 'required|string',
            'mobile_number' => 'required|string',
        ]);

        $user->update($request->only(['first_name', 'last_name', 'mobile_number']));

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully.',
            'data'    => $user,
        ]);
    }

    public function updatePassword(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $request->validate([
            'current_password' => 'required',
            'new_password' => [
                'required',
                'confirmed',
                'min:8',
                'regex:/[A-Z]/',
                'regex:/[a-z]/',
                'regex:/[0-9]/',
                'regex:/[!@#$%^&*]/',
            ],
        ], [
            'new_password.regex' => 'Password must include an uppercase letter, lowercase letter, number, and special character.',
        ]);

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'Current password is incorrect.',
            ], 422);
        }

        $user->update(['password' => Hash::make($request->new_password)]);

        return response()->json([
            'success' => true,
            'message' => 'Password updated successfully.',
        ]);
    }
}