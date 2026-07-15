<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\FarmController;
use App\Http\Controllers\Admin\FarmOwnerController;
use App\Http\Controllers\Admin\InspectionController;
use App\Http\Controllers\Admin\ServiceRequestController;
use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\ReportController;
use App\Http\Controllers\Farmer\DashboardController as FarmerDashboardController;
use App\Http\Controllers\Farmer\ServiceRequestController as FarmerServiceRequestController;
use App\Http\Controllers\Farmer\RecommendationController as FarmerRecommendationController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\Vet\DashboardController as VetDashboardController;
use App\Http\Controllers\Vet\VaccinationRequestController;
use App\Http\Controllers\Vet\ReportController as VetReportController;
use App\Http\Controllers\SensorIngestController;
use App\Http\Controllers\Admin\UserManagementController;

Route::post('/login', [AuthController::class, 'login']);
Route::post('/sensor-readings', [SensorIngestController::class, 'store']);
Route::post('/forgot-password', [App\Http\Controllers\AuthController::class, 'forgotPassword']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);

    Route::get('/settings', [SettingsController::class, 'show']);
    Route::put('/settings/profile', [SettingsController::class, 'updateProfile']);
    Route::put('/settings/password', [SettingsController::class, 'updatePassword']);

    /*
    |--------------------------------------------------------------------------
    | Veterinarian routes (role: vet)
    |--------------------------------------------------------------------------
    */
    Route::middleware('role:vet')->prefix('vet')->group(function () {
        Route::get('/dashboard', [VetDashboardController::class, 'index']);
        Route::get('/vaccination-requests', [VaccinationRequestController::class, 'index']);
        Route::patch('/vaccination-requests/{id}/accept', [VaccinationRequestController::class, 'accept']);
        Route::patch('/vaccination-requests/{id}/decline', [VaccinationRequestController::class, 'decline']);
        Route::patch('/vaccination-requests/{id}/complete', [VaccinationRequestController::class, 'complete']);
        Route::post('/vaccination-requests/{id}/note', [VaccinationRequestController::class, 'addNote']);
        Route::get('/reports', [VetReportController::class, 'index']);
    });

    /*
    |--------------------------------------------------------------------------
    | Farm Owner routes (role: farm_owner)
    |--------------------------------------------------------------------------
    */
    Route::middleware('role:farm_owner')->prefix('farmer')->group(function () {
        Route::get('/dashboard', [FarmerDashboardController::class, 'index']);
        Route::get('/service-requests', [FarmerServiceRequestController::class, 'index']);
        Route::post('/service-requests', [FarmerServiceRequestController::class, 'store']);
        Route::get('/recommendations', [FarmerRecommendationController::class, 'index']);
        Route::get('/farm-owners', [FarmOwnerController::class, 'index']);
        Route::post('/farm-owners', [FarmOwnerController::class, 'store']);
    });

    /*
    |--------------------------------------------------------------------------
    | Admin routes (role: admin)
    |--------------------------------------------------------------------------
    */
    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'index']);

        Route::post('/farm-owners', [FarmOwnerController::class, 'store']);

        Route::get('/farms', [FarmController::class, 'index']);
        Route::get('/farms-map', [FarmController::class, 'mapData']);
        Route::post('/farms', [FarmController::class, 'store']);
        Route::get('/farms/{id}', [FarmController::class, 'show']);
        Route::put('/farms/{id}', [FarmController::class, 'update']);
        Route::patch('/farms/{id}/deactivate', [FarmController::class, 'deactivate']);
        Route::patch('/farms/{id}/activate', [FarmController::class, 'activate']);
        Route::post('/farms/{userId}/resend-sms', [FarmController::class, 'resendSms']);

        Route::get('/inspections', [InspectionController::class, 'index']);
        Route::post('/inspections', [InspectionController::class, 'store']);
        Route::patch('/inspections/{id}/cancel', [InspectionController::class, 'cancel']);
        Route::patch('/inspections/{id}/complete', [InspectionController::class, 'complete']);

        Route::get('/service-requests', [ServiceRequestController::class, 'index']);
        Route::patch('/service-requests/{id}/cancel', [ServiceRequestController::class, 'cancel']);

        Route::get('/activity-logs', [ActivityLogController::class, 'index']);

        Route::get('/reports', [ReportController::class, 'index']);

        Route::get('/veterinarians', [UserManagementController::class, 'index']);
        Route::post('/veterinarians', [UserManagementController::class, 'store']);
        Route::put('/veterinarians/{id}', [UserManagementController::class, 'update']);
        Route::patch('/veterinarians/{id}/activate', [UserManagementController::class, 'activate']);
        Route::patch('/veterinarians/{id}/deactivate', [UserManagementController::class, 'deactivate']);
        Route::post('/veterinarians/{id}/reset-password', [UserManagementController::class, 'resetPassword']);
    });

    // farm_owner and vet route groups will be added in later phases (3.3–3.7).
});