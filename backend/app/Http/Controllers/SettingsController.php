<?php

namespace App\Http\Controllers;

use App\Models\Farm;
use App\Models\User;
use App\Models\EmailVerificationOtp;
use App\Mail\OtpCodeMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

class SettingsController extends Controller
{
    public function show()
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $data = [
            'first_name'         => $user->first_name,
            'last_name'          => $user->last_name,
            'mobile_number'      => $user->mobile_number,
            'email'              => $user->email,
            'role'               => $user->role,
            'profile_photo_url'  => $user->profile_photo_path ? asset('storage/' . $user->profile_photo_path) : null,
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

    /**
     * Email is deliberately NOT accepted here — adding or changing the
     * account's email now requires the requestEmailOtp/verifyEmailOtp
     * flow below, so an email is only ever saved after it's been proven
     * to belong to whoever is typing it in. This also blocks a user from
     * silently taking over another account's email through this form.
     */
    public function updateProfile(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $request->validate([
            'first_name'    => 'required|string',
            'last_name'     => 'required|string',
            'mobile_number' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'profile_photo' => 'nullable|image|max:5120',
        ], [
            'mobile_number.regex' => 'Please enter a valid Philippine mobile number (e.g. 09171234567).',
        ]);

        $mobileExists = User::where('mobile_number', $request->mobile_number)
            ->where('id', '!=', $user->id)
            ->exists();

        if ($mobileExists) {
            return response()->json([
                'success' => false,
                'message' => 'Another account already uses this mobile number.',
            ], 422);
        }

       $updates = [
            'first_name'    => $request->first_name,
            'last_name'     => $request->last_name,
            'mobile_number' => $request->mobile_number,
        ];

        if ($request->hasFile('profile_photo')) {
            $updates['profile_photo_path'] = $request->file('profile_photo')->store('profile-photos', 'public');
        }

        $user->update($updates);

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully.',
            'data'    => $user,
        ]);
    }

    private const EMAIL_OTP_TTL_MINUTES = 10;

    /**
     * Step 1 of adding/changing the account's email. Sends a 6-digit code
     * to the NEW address (not the account's current one, if any) — since
     * the whole point is proving the requester actually controls that
     * inbox before it's attached to their account.
     */
    public function requestEmailOtp(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $request->validate([
            'email' => 'required|email',
        ]);

        $taken = User::where('email', $request->email)
            ->where('id', '!=', $user->id)
            ->exists();

        if ($taken) {
            return response()->json([
                'success' => false,
                'message' => 'This email address is already used by another account.',
            ], 422);
        }

        // Invalidate any earlier unconsumed codes for this user so only the
        // most recently requested one is ever valid (also doubles as "resend").
        EmailVerificationOtp::where('user_id', $user->id)
            ->whereNull('consumed_at')
            ->update(['expires_at' => now()]);

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        EmailVerificationOtp::create([
            'user_id'       => $user->id,
            'pending_email' => $request->email,
            'code_hash'     => Hash::make($code),
            'expires_at'    => now()->addMinutes(self::EMAIL_OTP_TTL_MINUTES),
        ]);

        try {
            Mail::to($request->email)->send(new OtpCodeMail($user, $code, 'email_verification'));
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'success' => false,
                'message' => 'Failed to send the verification code. Please try again.',
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'A verification code has been sent to this email address.',
        ]);
    }

    /**
     * Step 2 — only on a matching, unexpired code is the email actually
     * written to the user's account. Re-checks uniqueness at commit time
     * too, in case another account claimed the same address in the
     * interim between requesting and entering the code.
     */
    public function verifyEmailOtp(Request $request)
    {
        /** @var \App\Models\User $user */
        $user = Auth::user();

        $request->validate([
            'email' => 'required|email',
            'code'  => 'required|string|size:6',
        ]);

        // Looked up without the expiry filter first so a genuinely expired
        // code can be told apart from a wrong one — same underlying query,
        // just split so the two failure states get distinct messages.
        $otp = EmailVerificationOtp::where('user_id', $user->id)
            ->where('pending_email', $request->email)
            ->whereNull('consumed_at')
            ->latest()
            ->first();

        if (!$otp || !Hash::check($request->code, $otp->code_hash)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid verification code.',
            ], 422);
        }

        if ($otp->expires_at->isPast()) {
            return response()->json([
                'success' => false,
                'message' => 'Verification code has expired.',
            ], 422);
        }

        $taken = User::where('email', $request->email)
            ->where('id', '!=', $user->id)
            ->exists();

        if ($taken) {
            return response()->json([
                'success' => false,
                'message' => 'This email address was just claimed by another account. Please try a different email.',
            ], 422);
        }

        $user->update(['email' => $request->email]);
        $otp->update(['consumed_at' => now()]);

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully.',
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