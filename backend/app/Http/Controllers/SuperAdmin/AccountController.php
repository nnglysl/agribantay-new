<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;

class AccountController extends Controller
{
    // Deliberately excludes 'super_admin' and 'farm_owner' — this
    // controller only ever touches Admin/Vet accounts, matching the
    // spec exactly ("Create, edit, activate/deactivate, and reset
    // passwords for Admin and Veterinarian accounts"). Farm owners stay
    // with regular Admin's existing Register Farm Owner flow, and
    // creating another Super Admin isn't exposed through this endpoint.
    private const MANAGEABLE_ROLES = ['admin', 'vet'];

    /**
     * Defense in depth: even if route-level protection is ever
     * misconfigured, every method here re-checks the caller is actually
     * a Super Admin before touching anything.
     */
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

    /**
     * Lists Admin and Vet accounts together, optionally filtered by
     * role and/or search text.
     */
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
                  ->orWhere('username', 'like', "%{$s}%");
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
            'username'      => $u->username,
            'role'          => $u->role,
            'status'        => $u->status,
        ]);

        return response()->json(['success' => true, 'data' => $accounts]);
    }

    public function store(Request $request)
    {
        if ($blocked = $this->guardSuperAdmin()) return $blocked;

        $request->validate([
            'full_name'      => 'required|string|max:255',
            'email'          => 'required|email|unique:users,email',
            'contact_number' => 'required|string',
            'username'       => 'required|string|min:4|unique:users,username',
            'password'       => 'required|string|min:8|confirmed',
            'role'           => 'required|in:admin,vet',
        ]);

        [$firstName, $lastName] = $this->splitFullName($request->full_name);

        $account = User::create([
            'first_name'           => $firstName,
            'last_name'            => $lastName,
            'email'                => $request->email,
            'mobile_number'        => $request->contact_number,
            'username'             => $request->username,
            'password'             => bcrypt($request->password),
            'role'                 => $request->role,
            'status'               => 'active',
            'must_change_password' => false,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'super_admin',
            'action'  => 'Created ' . ucfirst($request->role) . ' Account',
            'details' => "Created {$request->role} account for {$account->first_name} {$account->last_name} ({$account->username})",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success' => true,
            'message' => ucfirst($request->role) . ' account created successfully.',
            'data'    => $account,
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
            'username'       => 'required|string|min:4|unique:users,username,' . $account->id,
        ]);

        [$firstName, $lastName] = $this->splitFullName($request->full_name);

        $account->update([
            'first_name'    => $firstName,
            'last_name'     => $lastName,
            'email'         => $request->email,
            'mobile_number' => $request->contact_number,
            'username'      => $request->username,
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