<?php

namespace App\Providers;

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
