<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveAccount
{
    /**
     * Re-checks the account's CURRENT users.status on every authenticated
     * request, not just at login.
     *
     * Login already refuses an inactive account, but a Sanctum token issued
     * before a deactivation stays valid for its full 12-hour / 30-day life.
     * Without this check a farm owner who was deactivated mid-session kept
     * full API access until that token expired, and the SPA kept rendering
     * the dashboard because its route guard only reads localStorage.
     *
     * The offending token is deleted so the browser can't keep retrying with
     * it, and the response is a 401 — the same status the axios interceptor
     * already watches for — so the frontend drops its stored credentials and
     * returns the user to the login page without any new client-side
     * handling. The message is the one the login screen shows, so the reason
     * survives the redirect for anything that surfaces it.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->status !== 'active') {
            // Guarded: under actingAs() (and session auth) Sanctum hands back a
            // TransientToken, which has no delete() — only a real
            // PersonalAccessToken row can be revoked.
            $token = $user->currentAccessToken();

            if ($token instanceof \Laravel\Sanctum\PersonalAccessToken) {
                $token->delete();
            }

            return response()->json([
                'success' => false,
                'message' => 'Your account has been deactivated. Please contact the administrator for assistance.',
            ], 401);
        }

        return $next($request);
    }
}
