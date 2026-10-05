<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ActivityLog;
use App\Services\SmsService;
use App\Mail\TempPasswordMail;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

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
     * Takes 'email' and/or 'contact_number' — the two fields the Register
     * Account form shows — and keeps BOTH on the account when both are given,
     * which is what the form's own hint promises ("Enter at least one email or
     * mobile number. If both are provided, the temporary password will be sent
     * to the email address"). Email is only the delivery preference; it was
     * never meant to discard the number the Super Admin typed.
     *
     * The older single 'contact' field is still accepted so any caller using
     * that shape keeps working; it is sorted into the right field below.
     *
     * Super Admin never types a password. A temporary one is generated and
     * delivered by email when there is an address, otherwise by SMS.
     */
    public function store(Request $request)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $request->validate([
            'full_name' => 'required|string|max:255',
            'role'      => 'required|in:admin,vet',
        ]);

        // Spaces are cosmetic on a phone number (e.g. "0917 123 4567") and
        // never valid in an email, so stripping them is safe for both.
        $email  = preg_replace('/\s+/', '', (string) $request->input('email', ''));
        $mobile = preg_replace('/\s+/', '', (string) $request->input('contact_number', ''));

        // Legacy shape: one 'contact' field holding either kind of value.
        // Only consulted when neither named field was sent, so a caller using
        // the current shape is never second-guessed.
        if ($email === '' && $mobile === '' && $request->filled('contact')) {
            $legacy = preg_replace('/\s+/', '', (string) $request->input('contact'));

            if (filter_var($legacy, FILTER_VALIDATE_EMAIL)) {
                $email = $legacy;
            } else {
                $mobile = $legacy;
            }
        }

        // Dashes etc. are cosmetic too, so compare and store the canonical
        // digits-only form (see User::normalizeMobileNumber).
        if ($mobile !== '') {
            $mobile = User::normalizeMobileNumber($mobile);
        }

        // Collected as a field => message map and thrown together, so the form
        // can mark every bad field at once instead of one per round trip. This
        // produces a 422 with Laravel's standard `errors` object.
        $errors = [];

        if ($email === '' && $mobile === '') {
            $errors['email'][] = 'Enter at least an email address or a mobile number.';
        }

        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'][] = 'Please enter a valid email address.';
        }

        if ($mobile !== '' && !preg_match('/^09\d{9}$/', $mobile)) {
            $errors['contact_number'][] = 'Please enter a valid mobile number.';
        }

        // Both columns carry a UNIQUE index. Checked here so a clash is a
        // readable 422 naming the offending field rather than a 500 raised
        // from the driver.
        if ($email !== '' && !isset($errors['email']) && User::where('email', $email)->exists()) {
            $errors['email'][] = 'This email address is already registered.';
        }

        if ($mobile !== '' && !isset($errors['contact_number']) && User::where('mobile_number', $mobile)->exists()) {
            $errors['contact_number'][] = 'This mobile number is already registered.';
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        [$firstName, $lastName] = $this->splitFullName($request->full_name);
        $tempPassword = Str::random(10);

        // The account row and its log entry go in together: a failure part way
        // through must not leave a half-made account that the Super Admin
        // cannot see in the list but which still holds the email or number,
        // blocking a retry on the UNIQUE index.
        //
        // Delivery is deliberately OUTSIDE the transaction — it reaches a
        // third party, so it cannot be rolled back, and holding a database
        // transaction open across an SMTP or HTTP call is a long lock for no
        // benefit.
        try {
            $account = DB::transaction(function () use ($firstName, $lastName, $email, $mobile, $tempPassword, $request) {
                $account = User::create([
                    'first_name'           => $firstName,
                    'last_name'            => $lastName,
                    'email'                => $email !== '' ? $email : null,
                    'mobile_number'        => $mobile !== '' ? $mobile : null,
                    'password'             => bcrypt($tempPassword),
                    'role'                 => $request->role,
                    'status'               => 'active',
                    'must_change_password' => true,
                ]);

                ActivityLog::create([
                    'user_id' => Auth::id(),
                    'role'    => 'super_admin',
                    'action'  => 'Created ' . ucfirst($request->role) . ' Account',
                    'details' => "Created {$request->role} account for {$account->first_name} {$account->last_name}",
                    'type'    => 'Account',
                ]);

                return $account;
            });
        } catch (QueryException $e) {
            // The driver's message names columns and constraints, which is
            // useless to the Super Admin and more than they should be shown.
            // It goes to the log; the screen gets something actionable.
            Log::error('Account creation failed', [
                'role'      => $request->role,
                'has_email' => $email !== '',
                'exception' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'The account could not be saved. Please try again, or contact support if this keeps happening.',
            ], 500);
        }

        $delivered = false;

        if ($email !== '') {
            try {
                Mail::to($account->email)->send(new TempPasswordMail($account, $tempPassword, 'welcome'));
                $delivered = true;
            } catch (\Throwable $e) {
                report($e);
            }
        } else {
            $smsMessage = "Welcome to AgriBantay, {$firstName}! Your {$request->role} account is ready. Temporary password: {$tempPassword}. You will be asked to set a new password on your first login.";

            $delivered = app(SmsService::class)->send(
                $mobile,
                $smsMessage,
                'Account Creation',
                $account->id
            );
        }

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
                'message' => 'Please enter a valid mobile number.',
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

        // Drop any live session: the 'active' middleware would reject this
        // account's next request anyway, but revoking here means a signed-in
        // admin or vet is logged out rather than left holding a dead token.
        $account->tokens()->delete();

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

    /**
     * Issues a new temporary password and delivers it to the account holder.
     *
     * The temporary password is never returned to the caller. It used to be,
     * and the Super Admin screen printed it in a modal — which was the only
     * way the account holder ever learned it, because this endpoint sent
     * nothing at all. It now goes out over the account's own registered
     * channel, so the credential never passes through the browser of someone
     * who is not the account holder.
     *
     * Channel preference is EMAIL first, matching store() and
     * AuthController@forgotPassword ("email is the primary channel when both
     * exist"), falling back to SMS.
     *
     * The contact check runs BEFORE the password is replaced. Checking
     * afterwards — as a literal reading of the flow would have it — would
     * invalidate the old password and then discover there is no way to
     * deliver the new one, locking the account out with no path back.
     */
    public function resetPassword(int $id)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $account = User::whereIn('role', self::MANAGEABLE_ROLES)->findOrFail($id);

        $email  = trim((string) $account->email);
        $mobile = trim((string) $account->mobile_number);

        $useEmail = $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL);
        $useSms   = ! $useEmail && preg_match('/^09\d{9}$/', $mobile) === 1;

        if (! $useEmail && ! $useSms) {
            return response()->json([
                'success' => false,
                'message' => 'No valid contact information is available for this account. Add an email address or mobile number before resetting the password.',
            ], 422);
        }

        $newPassword = Str::random(10);

        $account->update([
            'password'             => bcrypt($newPassword),
            'must_change_password' => true,
        ]);

        $delivered = false;

        if ($useEmail) {
            try {
                Mail::to($account->email)->send(new TempPasswordMail($account, $newPassword, 'reset'));
                $delivered = true;
            } catch (\Throwable $e) {
                // report() records the transport failure. The exception does
                // not carry the password, so nothing sensitive reaches the log.
                report($e);
            }
        } else {
            $delivered = app(SmsService::class)->send(
                $mobile,
                "AgriBantay password reset. Your temporary password: {$newPassword}. You will be asked to set a new password on your next login.",
                'Password Reset',
                $account->id,
                null,
                // sms_logs is readable from the admin views, so the stored copy
                // of this message must not carry the live password.
                'AgriBantay password reset — temporary password sent (not stored).'
            );
        }

        // Logged either way: a reset that could not be delivered is exactly the
        // kind of event the Activity Log exists to show. The password itself is
        // never written here.
        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'super_admin',
            'action'  => 'Reset ' . ucfirst($account->role) . ' Password',
            'details' => "Reset password for {$account->first_name} {$account->last_name} — "
                . ($useEmail ? 'email' : 'SMS')
                . ($delivered ? ' sent' : ' FAILED to send'),
            'type'    => 'Account',
        ]);

        if (! $delivered) {
            // Reported honestly rather than as a success: the old password is
            // already gone, so the Super Admin needs to know the holder did not
            // receive the new one. Retrying issues and sends another one.
            return response()->json([
                'success' => false,
                'message' => 'The temporary password could not be sent to this account\'s registered '
                    . ($useEmail ? 'email address' : 'mobile number')
                    . '. The previous password no longer works — please try the reset again.',
            ], 502);
        }

        return response()->json([
            'success' => true,
            'message' => 'Password reset successfully. The temporary password has been sent to the user\'s registered contact information.',
        ]);
    }

    private function splitFullName(string $fullName): array
    {
        $parts = explode(' ', trim($fullName), 2);
        return [$parts[0], $parts[1] ?? ''];
    }
}