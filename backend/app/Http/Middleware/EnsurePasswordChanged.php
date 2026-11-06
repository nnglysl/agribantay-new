<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordChanged
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()->must_change_password
            && ! $request->routeIs('auth.me', 'auth.change-password', 'auth.logout')) {
            return response()->json([
                'success' => false,
                'code' => 'PASSWORD_CHANGE_REQUIRED',
                'message' => 'You must change your temporary password before continuing.',
                'must_change_password' => true,
            ], 403);
        }

        return $next($request);
    }
}
