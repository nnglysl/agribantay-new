<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'login' => 'required|string',
            'password' => 'required',
            'remember' => 'sometimes|boolean',
        ]);

        $isEmail = filter_var($request->login, FILTER_VALIDATE_EMAIL);

        // All credential writers lock this account before changing passwords
        // or tokens. A login verified against an old password cannot issue a
        // fresh token after a concurrent reset/recovery has committed.
        return DB::transaction(function () use ($request, $isEmail) {
            $user = User::where($isEmail ? 'email' : 'mobile_number', $request->login)
                ->lockForUpdate()->first();

            if (! $user || ! Hash::check($request->password, $user->password)) {
                return response()->json([
                    'message' => 'Invalid credentials.',
                ], 401);
            }

            if ($user->status !== 'active') {
                return response()->json([
                    'message' => 'Your account has been deactivated. Please contact the administrator for assistance.',
                ], 403);
            }

            $remember = $request->boolean('remember');
            $expiresAt = $remember ? now()->addDays(30) : now()->addHours(12);

            $name = $user->must_change_password ? $user->passwordChangeTokenName() : 'auth_token';
            $token = $user->createToken($name, ['*'], $expiresAt)->plainTextToken;

            return response()->json([
                'token' => $token,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->full_name,
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'must_change_password' => $user->must_change_password,
                    'requires_fresh_login' => false,
                    'legal_acknowledged_at' => $user->legal_acknowledged_at,
                ],
            ]);
        }, 3);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json($user->toArray() + [
            'requires_fresh_login' => $user->must_change_password && ! $user->hasPasswordChangeToken(),
        ])->header('Cache-Control', 'no-store');
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

        return DB::transaction(function () use ($request) {
            $authenticated = $request->user();
            $user = User::whereKey($authenticated->id)->lockForUpdate()->first();
            abort_unless($user && $user->status === 'active', 401, 'Unauthenticated.');
            $token = $authenticated->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                // Authentication may predate a concurrent reset or logout. Check
                // the actual row again while holding the same user lock as login.
                $token = $user->tokens()->whereKey($token->id)->lockForUpdate()->first();
                $expiration = config('sanctum.expiration');
                abort_unless($token && (! $token->expires_at || ! $token->expires_at->isPast())
                    && (! $expiration || $token->created_at->gt(now()->subMinutes($expiration))), 401, 'Unauthenticated.');
            }
            $user->withAccessToken($token);
            $forced = $user->must_change_password;
            if ($forced && ! $user->hasPasswordChangeToken()) {
                return response()->json([
                    'success' => false,
                    'code' => 'PASSWORD_REAUTHENTICATION_REQUIRED',
                    'message' => 'Please sign in again using your current temporary password.',
                ], 401);
            }
            // The first-login screen has no old-password field. Subsequent
            // changes must prove the current password, just like Settings.
            if (! $forced) {
                $request->validate(['current_password' => 'required|string']);
                if (! Hash::check($request->current_password, $user->password)) {
                    return response()->json(['message' => 'Current password is incorrect.'], 422);
                }
            }
            $user->update([
                'password' => Hash::make($request->new_password),
                'must_change_password' => false,
            ]);
            if ($forced) {
                $user->tokens()->where('id', '!=', $token->id)->delete();
            }

            return response()->json([
                'success' => true,
                'message' => 'Password updated successfully.',
                'user' => $user->toArray() + ['requires_fresh_login' => false],
            ]);
        }, 3);
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

    public function forgotPassword(Request $request)
    {
        return response()->json([
            'success' => false,
            'message' => 'Use the verification-code password reset flow.',
        ], 410);
    }
}
