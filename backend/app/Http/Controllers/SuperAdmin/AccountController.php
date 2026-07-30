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
            'id'            => $u->id,
            'first_name'    => $u->first_name,
            'last_name'     => $u->last_name,
            'email'         => $u->email,
            'mobile_number' => $u->mobile_number,
            'role'          => $u->role,
            'status'        => $u->status,
        ]);

        return response()->json(['success' => true, 'data' => $accounts]);
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

        $isEmail = filter_var($request->contact, FILTER_VALIDATE_EMAIL);

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

        $request->validate([
            'full_name'      => 'required|string|max:255',
            'email'          => 'required|email|unique:users,email,' . $account->id,
            'contact_number' => 'required|string',
        ]);

        [$firstName, $lastName] = $this->splitFullName($request->full_name);

        $account->update([
            'first_name'    => $firstName,
            'last_name'     => $lastName,
            'email'         => $request->email,
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