<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ActivityLog;
use App\Services\SmsService;
use App\Mail\TempPasswordMail;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;

class AccountController extends Controller
{
    private const MANAGEABLE_ROLES = ['admin', 'vet'];

    private function guardSuperAdmin(): ?\Illuminate\Http\JsonResponse
    {
        if (Auth::user()?->role !== 'super_admin') {
            return response()->json([
                'success' => false,
                'message' => 'Only Super Admin can manage Admin or Veterinarian accounts.',
            ], 403);
        }
        return null;
    }

    public function index(Request $request)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $query = User::whereIn('role', self::MANAGEABLE_ROLES);

        if ($request->role && in_array($request->role, self::MANAGEABLE_ROLES, true)) {
            $query->where('role', $request->role);
        }

        if ($request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('first_name', 'like', "%{$s}%")
                  ->orWhere('last_name', 'like', "%{$s}%")
                  ->orWhere('email', 'like', "%{$s}%")
                  ->orWhere('mobile_number', 'like', "%{$s}%");
            });
        }

        if ($request->status) {
            $query->where('status', strtolower($request->status));
        }

        $accounts = $query->orderBy('role')->orderBy('first_name')->get()->map(fn($u) => [
            'id'                => $u->id,
            'first_name'        => $u->first_name,
            'last_name'         => $u->last_name,
            'email'             => $u->email,
            'mobile_number'     => $u->mobile_number,
            'role'              => $u->role,
            'status'            => $u->status,
            'profile_photo_url' => $u->profile_photo_path ? asset('storage/' . $u->profile_photo_path) : null,
        ]);

        return response()->json(['success' => true, 'data' => $accounts]);
    }

    public function show(int $id)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $account = User::whereIn('role', self::MANAGEABLE_ROLES)->findOrFail($id);

        return response()->json([
            'success' => true,
            'data'    => [
                'id'                => $account->id,
                'first_name'        => $account->first_name,
                'last_name'         => $account->last_name,
                'email'             => $account->email,
                'mobile_number'     => $account->mobile_number,
                'role'              => $account->role,
                'status'            => $account->status,
                'profile_photo_url' => $account->profile_photo_path ? asset('storage/' . $account->profile_photo_path) : null,
                'created_at'        => $account->created_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * Accepts a single 'contact' field — either an email or a mobile
     * number — same pattern as Login and Farm Owner registration.
     * Super Admin no longer types a password directly; a temporary
     * password is generated and delivered via email or SMS depending
     * on the detected contact type.
     */
    public function store(Request $request)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $request->validate([
            'full_name' => 'required|string|max:255',
            'contact'   => 'required|string',
            'role'      => 'required|in:admin,vet',
        ]);

        // Spaces are cosmetic on a phone number (e.g. "0917 123 4567") and
        // never valid in an email, so stripping them here is safe either
        // way — it only affects the phone-number branch below.
        $request->merge(['contact' => preg_replace('/\s+/', '', (string) $request->contact)]);

        $isEmail = filter_var($request->contact, FILTER_VALIDATE_EMAIL);

        // Phone branch only: dashes etc. are cosmetic too, so compare and
        // store the canonical digits-only form (see User::normalizeMobileNumber).
        if (!$isEmail) {
            $request->merge(['contact' => User::normalizeMobileNumber($request->contact)]);
        }

        if (!$isEmail && !preg_match('/^09\d{9}$/', (string) $request->contact)) {
            return response()->json([
                'success' => false,
                'message' => 'Please enter a valid Philippine mobile number (e.g. 09171234567).',
            ], 422);
        }

        $exists = $isEmail
            ? User::where('email', $request->contact)->exists()
            : User::where('mobile_number', $request->contact)->exists();

        if ($exists) {
            return response()->json([
                'success' => false,
                'message' => $isEmail
                    ? 'An account with this email already exists.'
                    : 'The mobile number has already been taken.',
            ], 422);
        }

        [$firstName, $lastName] = $this->splitFullName($request->full_name);
        $tempPassword = Str::random(10);

        $account = User::create([
            'first_name'           => $firstName,
            'last_name'            => $lastName,
            'email'                => $isEmail ? $request->contact : null,
            'mobile_number'        => $isEmail ? null : $request->contact,
            'password'             => bcrypt($tempPassword),
            'role'                 => $request->role,
            'status'               => 'active',
            'must_change_password' => true,
        ]);

        $delivered = false;

        if ($isEmail) {
            try {
                Mail::to($account->email)->send(new TempPasswordMail($account, $tempPassword, 'welcome'));
                $delivered = true;
            } catch (\Throwable $e) {
                report($e);
            }
        } else {
            $smsMessage = "Welcome to AgriBantay, {$firstName}! Your {$request->role} account is ready. Temporary password: {$tempPassword}. You will be asked to set a new password on your first login.";

            $delivered = app(SmsService::class)->send(
                $request->contact,
                $smsMessage,
                'Account Creation',
                $account->id
            );
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'super_admin',
            'action'  => 'Created ' . ucfirst($request->role) . ' Account',
            'details' => "Created {$request->role} account for {$account->first_name} {$account->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'   => true,
            'message'   => ucfirst($request->role) . ' account created successfully.',
            'delivered' => $delivered,
            'data'      => $account,
        ]);
    }

    public function update(Request $request, int $id)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $account = User::whereIn('role', self::MANAGEABLE_ROLES)->findOrFail($id);

        // Email is validated for shape here (the form always sends it), but
        // deliberately never written to the account in this method — an
        // actual CHANGE to a new address has to go through
        // requestAccountEmailOtp/verifyAccountEmailOtp below. Submitting the
        // account's own unchanged email back is a no-op, so this still lets
        // "Save Changes" work normally when the email field wasn't touched.
        $request->validate([
            'full_name'      => 'required|string|max:255',
            'email'          => 'required|email',
            'contact_number' => 'required|string',
        ]);

        // Spaces/dashes are cosmetic (e.g. "0917 123 4567", "0917-123-4567") —
        // normalize to digits before the regex and uniqueness checks so
        // formatting can never disguise an already-registered number.
        $request->merge(['contact_number' => User::normalizeMobileNumber((string) $request->contact_number)]);

        if (!preg_match('/^09\d{9}$/', (string) $request->contact_number)) {
            return response()->json([
                'success' => false,
                'message' => 'Please enter a valid Philippine mobile number (e.g. 09171234567).',
            ], 422);
        }

        // A mobile number belongs to exactly one account system-wide; ignore
        // this account's own row so re-saving the same number still works.
        $taken = User::where('mobile_number', $request->contact_number)
            ->where('id', '!=', $account->id)
            ->exists();

        if ($taken) {
            return response()->json([
                'success' => false,
                'message' => 'The mobile number has already been taken.',
            ], 422);
        }

        [$firstName, $lastName] = $this->splitFullName($request->full_name);

        $account->update([
            'first_name'    => $firstName,
            'last_name'     => $lastName,
            'mobile_number' => $request->contact_number,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'super_admin',
            'action'  => 'Updated ' . ucfirst($account->role) . ' Account',
            'details' => "Updated {$account->role} account: {$account->first_name} {$account->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Account updated.',
            'data'    => $account,
        ]);
    }

    private const EMAIL_OTP_TTL_MINUTES = 10;

    /**
     * Step 1 of changing an Admin/Vet account's email. Mirrors the
     * self-service Settings flow but targets the managed account instead of
     * the currently authenticated Super Admin — the new address only gets
     * attached once it's proven reachable.
     */
    public function requestAccountEmailOtp(Request $request, int $id)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $account = User::whereIn('role', self::MANAGEABLE_ROLES)->findOrFail($id);

        $request->validate([
            'email' => 'required|email',
        ]);

        $taken = User::where('email', $request->email)
            ->where('id', '!=', $account->id)
            ->exists();

        if ($taken) {
            return response()->json([
                'success' => false,
                'message' => 'This email address is already used by another account.',
            ], 422);
        }

        \App\Models\EmailVerificationOtp::where('user_id', $account->id)
            ->whereNull('consumed_at')
            ->update(['expires_at' => now()]);

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        \App\Models\EmailVerificationOtp::create([
            'user_id'       => $account->id,
            'pending_email' => $request->email,
            'code_hash'     => \Illuminate\Support\Facades\Hash::make($code),
            'expires_at'    => now()->addMinutes(self::EMAIL_OTP_TTL_MINUTES),
        ]);

        try {
            Mail::to($request->email)->send(new \App\Mail\OtpCodeMail($account, $code, 'email_verification'));
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
     * Step 2 — the account's email is only ever written once the code
     * matches, with a final uniqueness re-check to close the race window
     * between request and verify.
     */
    public function verifyAccountEmailOtp(Request $request, int $id)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $account = User::whereIn('role', self::MANAGEABLE_ROLES)->findOrFail($id);

        $request->validate([
            'email' => 'required|email',
            'code'  => 'required|string|size:6',
        ]);

        // Looked up without the expiry filter first so a genuinely expired
        // code can be told apart from a wrong one.
        $otp = \App\Models\EmailVerificationOtp::where('user_id', $account->id)
            ->where('pending_email', $request->email)
            ->whereNull('consumed_at')
            ->latest()
            ->first();

        if (!$otp || !\Illuminate\Support\Facades\Hash::check($request->code, $otp->code_hash)) {
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
            ->where('id', '!=', $account->id)
            ->exists();

        if ($taken) {
            return response()->json([
                'success' => false,
                'message' => 'This email address was just claimed by another account. Please try a different email.',
            ], 422);
        }

        $account->update(['email' => $request->email]);
        $otp->update(['consumed_at' => now()]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'super_admin',
            'action'  => 'Verified ' . ucfirst($account->role) . ' Email',
            'details' => "Updated email for {$account->first_name} {$account->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully.',
            'data'    => $account,
        ]);
    }

    public function deactivate(int $id)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $account = User::whereIn('role', self::MANAGEABLE_ROLES)->findOrFail($id);
        $account->update(['status' => 'inactive']);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'super_admin',
            'action'  => 'Deactivated ' . ucfirst($account->role) . ' Account',
            'details' => "Deactivated: {$account->first_name} {$account->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json(['success' => true, 'message' => 'Account deactivated.']);
    }

    public function activate(int $id)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $account = User::whereIn('role', self::MANAGEABLE_ROLES)->findOrFail($id);
        $account->update(['status' => 'active']);

        return response()->json(['success' => true, 'message' => 'Account activated.']);
    }

    public function resetPassword(int $id)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $account = User::whereIn('role', self::MANAGEABLE_ROLES)->findOrFail($id);

        $newPassword = Str::random(10);
        $account->update([
            'password'             => bcrypt($newPassword),
            'must_change_password' => true,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'super_admin',
            'action'  => 'Reset ' . ucfirst($account->role) . ' Password',
            'details' => "Reset password for {$account->first_name} {$account->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'       => true,
            'message'       => 'Password reset successfully.',
            'temp_password' => $newPassword,
        ]);
    }

    private function splitFullName(string $fullName): array
    {
        $parts = explode(' ', trim($fullName), 2);
        return [$parts[0], $parts[1] ?? ''];
    }
}