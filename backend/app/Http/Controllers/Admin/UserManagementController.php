<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;

class UserManagementController extends Controller
{
    /**
     * List all veterinarian accounts, optionally filtered by search text
     * or status.
     */
    public function index(Request $request)
    {
        $query = User::where('role', 'vet');

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

        $vets = $query->orderBy('first_name')->get()->map(fn($v) => [
            'id'             => $v->id,
            'first_name'     => $v->first_name,
            'last_name'      => $v->last_name,
            'email'          => $v->email,
            'mobile_number'  => $v->mobile_number,
            'username'       => $v->username,
            'status'         => $v->status,
        ]);

        return response()->json(['success' => true, 'data' => $vets]);
    }

    /**
     * Create a new veterinarian account. Role is always forced to 'vet' —
     * this endpoint is never used for any other account type.
     */
    public function store(Request $request)
    {
        $request->validate([
            'full_name'        => 'required|string|max:255',
            'email'            => 'required|email|unique:users,email',
            'contact_number'   => 'required|string',
            'username'         => 'required|string|min:4|unique:users,username',
            'password'         => 'required|string|min:8|confirmed', // expects password_confirmation
        ]);

        [$firstName, $lastName] = $this->splitFullName($request->full_name);

        $vet = User::create([
            'first_name'           => $firstName,
            'last_name'            => $lastName,
            'email'                => $request->email,
            'mobile_number'        => $request->contact_number,
            'username'             => $request->username,
            'password'             => bcrypt($request->password),
            'role'                 => 'vet',
            'status'               => 'active',
            'must_change_password' => false,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Created Veterinarian Account',
            'details' => "Created vet account for {$vet->first_name} {$vet->last_name} ({$vet->username})",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Veterinarian account created successfully.',
            'data'    => $vet,
        ]);
    }

    public function update(Request $request, int $id)
    {
        $vet = User::where('id', $id)->where('role', 'vet')->firstOrFail();

        $request->validate([
            'full_name'      => 'required|string|max:255',
            'email'          => 'required|email|unique:users,email,' . $vet->id,
            'contact_number' => 'required|string',
            'username'       => 'required|string|min:4|unique:users,username,' . $vet->id,
        ]);

        [$firstName, $lastName] = $this->splitFullName($request->full_name);

        $vet->update([
            'first_name'    => $firstName,
            'last_name'     => $lastName,
            'email'         => $request->email,
            'mobile_number' => $request->contact_number,
            'username'      => $request->username,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Updated Veterinarian Account',
            'details' => "Updated vet account: {$vet->first_name} {$vet->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Veterinarian account updated.',
            'data'    => $vet,
        ]);
    }

    public function deactivate(int $id)
    {
        $vet = User::where('id', $id)->where('role', 'vet')->firstOrFail();
        $vet->update(['status' => 'inactive']);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Deactivated Veterinarian Account',
            'details' => "Deactivated: {$vet->first_name} {$vet->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json(['success' => true, 'message' => 'Veterinarian deactivated.']);
    }

    public function activate(int $id)
    {
        $vet = User::where('id', $id)->where('role', 'vet')->firstOrFail();
        $vet->update(['status' => 'active']);

        return response()->json(['success' => true, 'message' => 'Veterinarian activated.']);
    }

    /**
     * Generate a new temporary password for the vet. Since vets log in
     * with username/password (not the farm-owner mobile+SMS flow), the
     * new password is returned directly in the response for the admin
     * to relay — there's no existing SMS/email delivery channel wired
     * up for vet accounts yet.
     */
    public function resetPassword(int $id)
    {
        $vet = User::where('id', $id)->where('role', 'vet')->firstOrFail();

        $newPassword = Str::random(10);
        $vet->update([
            'password'             => bcrypt($newPassword),
            'must_change_password' => true,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Reset Veterinarian Password',
            'details' => "Reset password for {$vet->first_name} {$vet->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'          => true,
            'message'          => 'Password reset successfully.',
            'temp_password'    => $newPassword,
        ]);
    }

    /**
     * Splits a single "Full Name" input into first/last name, matching
     * the existing first_name/last_name schema used everywhere else in
     * the app. Anything after the first space becomes the last name.
     */
    private function splitFullName(string $fullName): array
    {
        $parts = explode(' ', trim($fullName), 2);
        return [$parts[0], $parts[1] ?? ''];
    }
}