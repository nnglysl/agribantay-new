<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\ActivityLog;
use App\Services\SmsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'login'    => 'required|string',
            'password' => 'required',
        ]);

        $isEmail = filter_var($request->login, FILTER_VALIDATE_EMAIL);

        $user = $isEmail
            ? User::where('email', $request->login)->first()
            : User::where('mobile_number', $request->login)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid credentials.',
            ], 401);
        }

        if ($user->status === 'inactive') {
            return response()->json([
                'message' => 'Your account is inactive. Contact the administrator.',
            ], 403);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user'  => [
                'id'                    => $user->id,
                'name'                  => $user->full_name,
                'first_name'            => $user->first_name,
                'last_name'             => $user->last_name,
                'email'                 => $user->email,
                'role'                  => $user->role,
                'must_change_password'  => $user->must_change_password,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }

    public function changePassword(Request $request)
    {
        $request->validate([
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

        $user = $request->user();
        $user->update([
            'password'             => Hash::make($request->new_password),
            'must_change_password' => false,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Password updated successfully.',
        ]);
    }

    /**
     * Public, unauthenticated endpoint. Accepts a mobile number, and if a
     * matching account exists, generates a new temporary password and
     * sends it via SMS. Always returns a generic success message
     * regardless of whether the number matched, so this endpoint can't be
     * used to check which mobile numbers have accounts.
     */
    public function forgotPassword(Request $request)
    {
        $request->validate([
            'mobile_number' => 'required|string',
        ]);

        $genericMessage = 'If an account exists for that mobile number, a temporary password has been sent via SMS.';

        $user = User::where('mobile_number', $request->mobile_number)->first();

        if (!$user) {
            return response()->json([
                'success' => true,
                'message' => $genericMessage,
            ]);
        }

        if ($user->status === 'inactive') {
            return response()->json([
                'success' => true,
                'message' => $genericMessage,
            ]);
        }

        $tempPassword = Str::random(10);

        $user->update([
            'password'             => Hash::make($tempPassword),
            'must_change_password' => true,
        ]);

        $smsMessage = "AgriBantay password reset. Your temporary password: {$tempPassword}. You will be asked to set a new password on your next login.";

        $smsSent = app(SmsService::class)->send(
            $user->mobile_number,
            $smsMessage,
            'Password Reset',
            $user->id
        );

        ActivityLog::create([
            'user_id' => $user->id,
            'role'    => $user->role,
            'action'  => 'Password Reset Requested',
            'details' => "Password reset requested via forgot-password for {$user->first_name} {$user->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'  => true,
            'message'  => $genericMessage,
            'sms_sent' => $smsSent,
        ]);
    }
}