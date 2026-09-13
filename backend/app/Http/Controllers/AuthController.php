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
                'legal_acknowledged_at' => $user->legal_acknowledged_at,
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
     * Authenticated endpoint. Called from the first-login Terms & Privacy
     * acknowledgment modal once the user checks the box and clicks
     * "Agree and Continue". Stamps legal_acknowledged_at with the current
     * timestamp so the modal is never shown again for this account.
     */
    public function acknowledgeLegal(Request $request)
    {
        $user = $request->user();
        $user->legal_acknowledged_at = now();
        $user->save();

        return response()->json([
            'legal_acknowledged_at' => $user->legal_acknowledged_at,
        ]);
    }

    /**
     * Public, unauthenticated endpoint. Accepts either an email or a mobile
     * number in `login` to LOOK UP the account (a user might not remember
     * which one they registered with) — but once the account is found,
     * the DELIVERY channel is chosen from the account's own data, not from
     * which field they typed into. This keeps behavior consistent with
     * account creation's "email is the primary channel when both exist"
     * rule: an owner with both an email and a phone always gets the reset
     * via email, even if they typed their phone number into this field.
     *
     * Always returns a generic success message regardless of whether the
     * login matched, so this endpoint can't be used to check which
     * accounts exist.
     */
    public function forgotPassword(Request $request)
    {
        $request->validate([
            'login' => 'required|string',
        ]);

        $isEmailInput = filter_var($request->login, FILTER_VALIDATE_EMAIL);

        $user = $isEmailInput
            ? User::where('email', $request->login)->first()
            : User::where('mobile_number', $request->login)->first();

        // Generic message no longer needs to guess the channel from the
        // input — it's now always accurate ("we'll use whatever's on the
        // account"), so a single wording covers both cases without
        // revealing which channel a given account actually has.
        $genericMessage = 'If an account exists, a temporary password has been sent to the registered email or mobile number on file.';

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
        $usedEmail = (bool) $user->email;

        if ($usedEmail) {
            try {
                Mail::to($user->email)->send(new TempPasswordMail($user, $tempPassword, 'reset'));
                $delivered = true;
            } catch (\Throwable $e) {
                report($e);
            }
        } elseif ($user->mobile_number) {
            $smsMessage = "AgriBantay password reset. Your temporary password: {$tempPassword}. You will be asked to set a new password on your next login.";

            $delivered = app(SmsService::class)->send(
                $user->mobile_number,
                $smsMessage,
                'Password Reset',
                $user->id
            );
        }
        // else: matched account has neither email nor phone — shouldn't
        // happen given mobile_number is required at registration, but
        // left as a safe no-op rather than throwing if it ever does.

        ActivityLog::create([
            'user_id' => $user->id,
            'role'    => $user->role,
            'action'  => 'Password Reset Requested',
            'details' => "Password reset requested via forgot-password ({$user->first_name} {$user->last_name}) — " . ($usedEmail ? 'email' : 'SMS'),
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'   => true,
            'message'   => $genericMessage,
            'delivered' => $delivered,
        ]);
    }
}