<?php

namespace App\Providers;

use App\Models\FarmControlDocument;
use App\Policies\FarmControlDocumentPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // No contact details or reset tokens in cache keys. Separate IP and
        // identity buckets also limit guesses spread across multiple IPs.
        $identity = static function (Request $request) {
            $value = $request->input('login') ?? $request->input('email') ?? $request->user()?->id ?? '';

            return hash('sha256', strtolower(trim(is_string($value) || is_int($value) ? (string) $value : '')));
        };
        RateLimiter::for('auth-login', static fn (Request $request) => [
            Limit::perMinute(20)->by('ip:'.$request->ip()),
            Limit::perMinute(5)->by('identity:'.$identity($request)),
        ]);
        RateLimiter::for('otp-send', static fn (Request $request) => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
            Limit::perMinute(3)->by('identity:'.$identity($request)),
        ]);
        RateLimiter::for('otp-verify', static fn (Request $request) => [
            Limit::perMinute(20)->by('ip:'.$request->ip()),
            Limit::perMinute(5)->by('identity:'.$identity($request)),
        ]);
        RateLimiter::for('auth-sensitive', static fn (Request $request) => Limit::perMinute(10)
            ->by((string) ($request->user()?->id ?? $request->ip())));
        Gate::policy(
            FarmControlDocument::class,
            FarmControlDocumentPolicy::class
        );
        // Every route parameter in routes/api.php is a numeric database id
        // ({id}, {farmId}, {userId}, {generatedReport}). Constraining them
        // globally means a non-numeric value like /admin/farms/abc simply
        // doesn't match a route (404) instead of reaching a controller whose
        // `int $id` type-hint would throw a TypeError (500 with a stack trace
        // when debug is on). Numeric-but-missing ids still 404 via findOrFail.
        foreach (['id', 'farmId', 'userId', 'generatedReport'] as $param) {
            Route::pattern($param, '[0-9]+');
        }
    }
}
