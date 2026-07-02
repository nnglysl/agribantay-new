<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\FarmController;
use App\Http\Controllers\Admin\ServiceRequestController;
use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\ReportController;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    /*
    |--------------------------------------------------------------------------
    | Admin routes (role: admin)
    |--------------------------------------------------------------------------
    */
    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'index']);

        Route::get('/farms', [FarmController::class, 'index']);
        Route::post('/farms', [FarmController::class, 'store']);
        Route::get('/farms/{id}', [FarmController::class, 'show']);
        Route::put('/farms/{id}', [FarmController::class, 'update']);
        Route::patch('/farms/{id}/deactivate', [FarmController::class, 'deactivate']);
        Route::patch('/farms/{id}/activate', [FarmController::class, 'activate']);

        Route::get('/service-requests', [ServiceRequestController::class, 'index']);
        Route::patch('/service-requests/{id}/cancel', [ServiceRequestController::class, 'cancel']);

        Route::get('/activity-logs', [ActivityLogController::class, 'index']);

        Route::get('/reports', [ReportController::class, 'index']);
    });

    // farm_owner and vet route groups will be added in later phases (3.3–3.7).
});
