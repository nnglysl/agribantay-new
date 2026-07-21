<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\FarmController;
use App\Http\Controllers\Admin\FarmOwnerController;
use App\Http\Controllers\Admin\InspectionController;
use App\Http\Controllers\Admin\ServiceRequestController;
use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\AlertHistoryController;
use App\Http\Controllers\Admin\MaintenanceController as AdminMaintenanceController;
use App\Http\Controllers\Admin\ReportController;
use App\Http\Controllers\Farmer\DashboardController as FarmerDashboardController;
use App\Http\Controllers\Farmer\ServiceRequestController as FarmerServiceRequestController;
use App\Http\Controllers\Farmer\RecommendationController as FarmerRecommendationController;
use App\Http\Controllers\Farmer\InsightController as FarmerInsightController;
use App\Http\Controllers\Farmer\MaintenanceController as FarmerMaintenanceController;
use App\Http\Controllers\Farmer\DisposalController as FarmerDisposalController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\Vet\DashboardController as VetDashboardController;
use App\Http\Controllers\Vet\VaccinationRequestController;
use App\Http\Controllers\Vet\ReportController as VetReportController;
use App\Http\Controllers\SensorIngestController;
use App\Http\Controllers\SuperAdmin\AccountController;

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
    Route::middleware('role:vet,super_admin')->prefix('vet')->group(function () {
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
        Route::get('/insights', [FarmerInsightController::class, 'index']);
        Route::get('/maintenance', [FarmerMaintenanceController::class, 'index']);
        Route::post('/maintenance', [FarmerMaintenanceController::class, 'store']);
        Route::get('/disposal-records', [FarmerDisposalController::class, 'index']);
        Route::post('/disposal-records', [FarmerDisposalController::class, 'store']);
        Route::get('/farm-owners', [FarmOwnerController::class, 'index']);
        Route::post('/farm-owners', [FarmOwnerController::class, 'store']);
    });

    /*
    |--------------------------------------------------------------------------
    | Admin routes (role: admin) — Super Admin can call these too, so
    | every existing Admin page/module keeps working for Super Admin
    | with zero duplicated backend logic. Veterinarian account management
    | has moved out of this group entirely (see Super Admin group below).
    |--------------------------------------------------------------------------
    */
    Route::middleware('role:admin,super_admin')->prefix('admin')->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'index']);

        Route::get('/farm-owners', [FarmOwnerController::class, 'index']);
        Route::post('/farm-owners', [FarmOwnerController::class, 'store']);

        Route::get('/farms', [FarmController::class, 'index']);
        Route::get('/farms-map', [FarmController::class, 'mapData']);
        Route::post('/farms', [FarmController::class, 'store']);
        Route::get('/farms/{id}', [FarmController::class, 'show']);
        Route::get('/farms/{id}/trend', [FarmController::class, 'trend']);
        Route::get('/farms/{id}/root-cause', [FarmController::class, 'rootCause']);
        Route::put('/farms/{id}', [FarmController::class, 'update']);
        Route::patch('/farms/{id}/deactivate', [FarmController::class, 'deactivate']);
        Route::patch('/farms/{id}/activate', [FarmController::class, 'activate']);
        Route::post('/farms/{userId}/resend-sms', [FarmController::class, 'resendSms']);

        Route::get('/inspections', [InspectionController::class, 'index']);
        Route::post('/inspections', [InspectionController::class, 'store']);
        Route::patch('/inspections/{id}/cancel', [InspectionController::class, 'cancel']);
        Route::patch('/inspections/{id}/complete', [InspectionController::class, 'complete']);

        Route::get('/service-requests', [ServiceRequestController::class, 'index']);
        Route::patch('/service-requests/{id}/accept', [ServiceRequestController::class, 'accept']);
        Route::patch('/service-requests/{id}/decline', [ServiceRequestController::class, 'decline']);
        Route::patch('/service-requests/{id}/complete', [ServiceRequestController::class, 'complete']);
        Route::patch('/service-requests/{id}/cancel', [ServiceRequestController::class, 'cancel']);

        Route::get('/reports', [ReportController::class, 'index']);

        Route::get('/alert-history', [AlertHistoryController::class, 'index']);

        Route::get('/maintenance/overdue', [AdminMaintenanceController::class, 'overdue']);
    });

    /*
    |--------------------------------------------------------------------------
    | Super Admin routes (role: super_admin) — exclusive, not shared with
    | regular Admin. Manages both Admin and Veterinarian accounts.
    |--------------------------------------------------------------------------
    */
    Route::middleware('role:super_admin')->prefix('superadmin')->group(function () {
        Route::get('/accounts', [AccountController::class, 'index']);
        Route::post('/accounts', [AccountController::class, 'store']);
        Route::put('/accounts/{id}', [AccountController::class, 'update']);
        Route::patch('/accounts/{id}/activate', [AccountController::class, 'activate']);
        Route::patch('/accounts/{id}/deactivate', [AccountController::class, 'deactivate']);
        Route::post('/accounts/{id}/reset-password', [AccountController::class, 'resetPassword']);

        Route::get('/activity-logs', [ActivityLogController::class, 'index']);
    });
});