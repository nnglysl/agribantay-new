<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\PasswordResetOtp;
use App\Models\ActivityLog;
use App\Services\SmsService;
use App\Mail\OtpCodeMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * OTP-based password reset — replaces the old single-step
 * AuthController::forgotPassword() flow (temp password sent directly).
 * That method is left untouched for now; this is a separate, newer flow.
 *
 * Three steps, three endpoints:
 *   1. requestOtp  — user picks a channel + enters matching contact info,
 *      gets a 6-digit code sent to it.
 *   2. verifyOtp   — user enters the code, gets a short-lived reset_token
 *      back if correct.
 *   3. resetPassword — reset_token authorizes setting the new password.
 *
 * Every response uses generic wording where account existence could
 * otherwise be inferred, same principle as the existing forgotPassword().
 */
class PasswordResetController extends Controller
{
    private const OTP_TTL_MINUTES = 10;
    private const RESET_TOKEN_TTL_MINUTES = 15;

    public function requestOtp(Request $request)
    {
        $request->validate([
            'login'   => 'required|string',
            'channel' => 'required|in:email,sms',
        ]);

        $user = $request->channel === 'email'
            ? User::where('email', $request->login)->first()
            : User::where('mobile_number', $request->login)->first();

        $generic = [
            'success' => true,
            'message' => $request->channel === 'email'
                ? 'If an account exists for that email address, a verification code has been sent.'
                : 'If an account exists for that mobile number, a verification code has been sent.',
        ];

        if (!$user || $user->status === 'inactive') {
            return response()->json($generic);
        }

        // Invalidate any earlier unconsumed codes for this user+channel so
        // only the most recent one is ever valid — supports "resend" by
        // simply calling this endpoint again.
        PasswordResetOtp::where('user_id', $user->id)
            ->where('channel', $request->channel)
            ->whereNull('consumed_at')
            ->update(['expires_at' => now()]);

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        PasswordResetOtp::create([
            'user_id'    => $user->id,
            'channel'    => $request->channel,
            'code_hash'  => Hash::make($code),
            'expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES),
        ]);

        if ($request->channel === 'email') {
            try {
                Mail::to($user->email)->send(new OtpCodeMail($user, $code));
            } catch (\Throwable $e) {
                report($e);
            }
        } else {
            $smsMessage = "AgriBantay password reset code: {$code}. This code expires in 10 minutes. Do not share it with anyone.";
            app(SmsService::class)->send($user->mobile_number, $smsMessage, 'Password Reset', $user->id);
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'role'    => $user->role,
            'action'  => 'Password Reset Code Requested',
            'details' => "OTP requested via {$request->channel} ({$user->first_name} {$user->last_name})",
            'type'    => 'Account',
        ]);

        return response()->json($generic);
    }

    public function verifyOtp(Request $request)
    {
        $request->validate([
            'login'   => 'required|string',
            'channel' => 'required|in:email,sms',
            'code'    => 'required|string|size:6',
        ]);

        $user = $request->channel === 'email'
            ? User::where('email', $request->login)->first()
            : User::where('mobile_number', $request->login)->first();

        $invalid = response()->json([
            'success' => false,
            'message' => 'Invalid or expired code. Please try again or request a new one.',
        ], 422);

        if (!$user) {
            return $invalid;
        }

        $otp = PasswordResetOtp::where('user_id', $user->id)
            ->where('channel', $request->channel)
            ->whereNull('consumed_at')
            ->whereNull('verified_at')
            ->where('expires_at', '>', now())
            ->latest()
            ->first();

        if (!$otp || !Hash::check($request->code, $otp->code_hash)) {
            return $invalid;
        }

        $resetToken = Str::random(40);

        $otp->update([
            'verified_at'             => now(),
            'reset_token'             => $resetToken,
            'reset_token_expires_at'  => now()->addMinutes(self::RESET_TOKEN_TTL_MINUTES),
        ]);

        return response()->json([
            'success'     => true,
            'reset_token' => $resetToken,
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'reset_token'  => 'required|string',
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

        $otp = PasswordResetOtp::where('reset_token', $request->reset_token)
            ->whereNotNull('verified_at')
            ->whereNull('consumed_at')
            ->where('reset_token_expires_at', '>', now())
            ->first();

        if (!$otp) {
            return response()->json([
                'success' => false,
                'message' => 'This reset link has expired or already been used. Please start over.',
            ], 422);
        }

        $user = $otp->user;
        $user->update([
            'password'             => Hash::make($request->new_password),
            'must_change_password' => false,
        ]);

        $otp->update(['consumed_at' => now()]);

        ActivityLog::create([
            'user_id' => $user->id,
            'role'    => $user->role,
            'action'  => 'Password Reset Completed',
            'details' => "Password reset completed via OTP ({$user->first_name} {$user->last_name})",
            'type'    => 'Account',
        ]);

        return response()->json(['success' => true, 'message' => 'Password reset successfully.']);
    }
}