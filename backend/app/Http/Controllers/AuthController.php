<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

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

        $user = $isEmail
            ? User::where('email', $request->login)->first()
            : User::where('mobile_number', $request->login)->first();

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

        $token = $user->createToken('auth_token', ['*'], $expiresAt)->plainTextToken;

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
        // The first-login screen has no old-password field. Subsequent
        // changes must prove the current password, just like Settings.
        if (! $user->must_change_password) {
            $request->validate(['current_password' => 'required|string']);
            if (! Hash::check($request->current_password, $user->password)) {
                return response()->json(['message' => 'Current password is incorrect.'], 422);
            }
        }
        $user->update([
            'password' => Hash::make($request->new_password),
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

    public function forgotPassword(Request $request)
    {
        return response()->json([
            'success' => false,
            'message' => 'Use the verification-code password reset flow.',
        ], 410);
    }
}
