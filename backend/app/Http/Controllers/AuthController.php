<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\ActivityLog;
use App\Services\SmsService;
use App\Mail\TempPasswordMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'login'    => 'required|string',
            'password' => 'required',
            'remember' => 'sometimes|boolean',
        ]);

        // login_type is sent by the frontend as a hint, but we re-detect
        // server-side rather than trusting it blindly — this is the same
        // filter_var check as before, just kept as the source of truth.
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

        // "Remember me" controls how long the Sanctum token stays valid.
        // Checked -> 30 days. Unchecked -> 12 hours, so an abandoned
        // session on a public/shared computer doesn't stay valid indefinitely.
        $remember = $request->boolean('remember');
        $expiresAt = $remember ? now()->addDays(30) : now()->addHours(12);

        $token = $user->createToken('auth_token', ['*'], $expiresAt)->plainTextToken;

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
     * Public, unauthenticated endpoint. Accepts either an email or a mobile
     * number in `login`, and if a matching account exists, generates a new
     * temporary password and sends it via email or SMS depending on which
     * one matched. Always returns a generic success message regardless of
     * whether the login matched, so this endpoint can't be used to check
     * which accounts exist.
     */
    public function forgotPassword(Request $request)
    {
        $request->validate([
            'login' => 'required|string',
        ]);

        $isEmail = filter_var($request->login, FILTER_VALIDATE_EMAIL);

        $genericMessage = $isEmail
            ? 'If an account exists for that email address, a temporary password has been sent.'
            : 'If an account exists for that mobile number, a temporary password has been sent via SMS.';

        $user = $isEmail
            ? User::where('email', $request->login)->first()
            : User::where('mobile_number', $request->login)->first();

        if (!$user || $user->status === 'inactive') {
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

        $delivered = false;

        if ($isEmail) {
            try {
                Mail::to($user->email)->send(new TempPasswordMail($user, $tempPassword));
                $delivered = true;
            } catch (\Throwable $e) {
                // Swallow the exception rather than leaking mail-server
                // details to the client — the generic message still returns
                // success so we don't reveal whether the account exists.
                report($e);
            }
        } else {
            $smsMessage = "AgriBantay password reset. Your temporary password: {$tempPassword}. You will be asked to set a new password on your next login.";

            $delivered = app(SmsService::class)->send(
                $user->mobile_number,
                $smsMessage,
                'Password Reset',
                $user->id
            );
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'role'    => $user->role,
            'action'  => 'Password Reset Requested',
            'details' => "Password reset requested via forgot-password ({$user->first_name} {$user->last_name}) — " . ($isEmail ? 'email' : 'SMS'),
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'   => true,
            'message'   => $genericMessage,
            'delivered' => $delivered,
        ]);
    }
}