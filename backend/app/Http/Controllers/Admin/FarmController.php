<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\User;
use App\Models\ActivityLog;
use App\Services\SmsService;
use App\Services\FarmStatusService;
use App\Services\GeocodingService;
use App\Services\TrendAnalysisService;
use App\Services\RootCauseService;
use App\Services\PreventiveActionService;
use App\Services\RecommendationExplanationService;
use App\Services\MaintenanceStatusService;
use App\Models\MaintenanceLog;
use App\Models\ManureDisposalRecord;
use App\Models\Inspection;
use App\Models\ServiceRequest;
use App\Mail\TempPasswordMail;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;

class FarmController extends Controller
{
    public function index(Request $request)
    {
        $query = Farm::with(['user', 'sensors', 'sensorReadings' => function ($q) {
            $q->latest()->limit(1)->with('sensor');
        }]);

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->barangay) {
            $query->where('barangay', $request->barangay);
        }

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('farm_name', 'like', "%{$request->search}%")
                  ->orWhere('owner_name', 'like', "%{$request->search}%")
                  ->orWhereRaw("DATE_FORMAT(created_at, '%b %e, %Y') LIKE ?", ["%{$request->search}%"]);
            });
        }

        $farms = $query->latest()->get();

        $statusService = app(FarmStatusService::class);

        foreach ($farms as $farm) {
            $statusService->syncStatus($farm);
        }

        if ($request->monitoring_status) {
            $farms = $farms->filter(fn($f) => $statusService->displayStatus($f) === $request->monitoring_status)->values();
        }

        if ($request->farm_size) {
            $farms = $farms->filter(fn($f) => $f->farm_size === $request->farm_size)->values();
        }

        $farms = $farms->map(function ($farm) use ($statusService) {
            $latestReading = $farm->sensorReadings->first();
            // Prefer the sensor that's actually communicating (via the latest
            // reading); fall back to the most recently registered device so a
            // farm's Device Name still shows up before its first reading ever
            // comes in, instead of staying blank until then.
            $sensor = $latestReading?->sensor ?? $farm->sensors->sortByDesc('installed_at')->first();
            $displayStatus = $statusService->displayStatus($farm);

            return [
                'id'          => $farm->id,
                'owner_profile_photo_url' => $farm->user?->profile_photo_path
                    ? asset('storage/' . $farm->user->profile_photo_path)
                    : null,
                'farm_name'   => $farm->farm_name,
                'owner_name'  => $farm->owner_name,
                'mobile_number' => $farm->mobile_number,
                'email'       => $farm->user?->email,
                'barangay'    => $farm->barangay,
                'address'     => $farm->address,
                'num_birds'   => $farm->num_birds,
                'farm_size'   => $farm->farm_size,
                'farm_type'   => $farm->farm_type,
                'farm_area'   => $farm->farm_area,
                'farm_area_unit' => $farm->farm_area_unit,
                'status'      => $farm->status,
                'current_status' => $displayStatus,
                'device_name' => $sensor?->label ?: $sensor?->sensor_code,
                'ammonia'     => $latestReading?->ammonia,
                'ammonia_status' => $latestReading?->ammonia_status,
                'sensor_status'  => $displayStatus,
                'created_at'  => $farm->created_at,
            ];
        });

        return response()->json(['success' => true, 'data' => $farms]);
    }

    public function mapData()
    {
        $farms = Farm::whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->with(['sensors', 'sensorReadings' => function ($q) {
                $q->latest()->limit(1);
            }])
            ->get();

        $statusService = app(FarmStatusService::class);

        foreach ($farms as $farm) {
            $statusService->syncStatus($farm);
        }

        $farms = $farms->map(fn($f) => [
                'id'             => $f->id,
                'farm_name'      => $f->farm_name,
                'owner_name'     => $f->owner_name,
                'barangay'       => $f->barangay,
                'latitude'       => $f->latitude,
                'longitude'      => $f->longitude,
                'current_status' => $statusService->displayStatus($f),
            ]);

        return response()->json(['success' => true, 'data' => $farms]);
    }

    private function geocodeWithFallback(?string $lotNumber, ?string $street, string $barangay): ?array
    {
        $fullAddress = implode(', ', array_filter([
            $lotNumber,
            $street,
            $barangay,
            'San Jose',
            'Batangas',
            'Philippines',
        ]));

        $coordinates = app(GeocodingService::class)->geocode($fullAddress);

        if (!$coordinates) {
            $barangayOnly = implode(', ', array_filter([
                $barangay,
                'San Jose',
                'Batangas',
                'Philippines',
            ]));

            $coordinates = app(GeocodingService::class)->geocode($barangayOnly);
        }

        return $coordinates;
    }

    /**
     * Temp password delivery: email if the new owner has one (Laravel
     * Mail via TempPasswordMail), SMS otherwise (existing SmsService) —
     * never both. Same rule as FarmOwnerController::store(). This branch
     * currently has no live frontend caller (RegisterModal/AddFarmModal
     * both always pass farm_owner_id for an owner created via the
     * dedicated registration step), but is kept consistent in case that
     * ever changes.
     */
    public function store(Request $request)
    {
        // Spaces are cosmetic (e.g. "0917 123 4567") — strip them before the
        // regex check so the validation and the stored value both only see
        // the actual digits, not how the user chose to space them out.
        if ($request->filled('mobile_number')) {
            $request->merge(['mobile_number' => preg_replace('/\s+/', '', $request->mobile_number)]);
        }

        $request->validate([
            'farm_owner_id' => 'nullable|exists:users,id',

            'first_name'    => 'required_without:farm_owner_id|string',
            'last_name'     => 'required_without:farm_owner_id|string',
            'mobile_number' => ['required_without:farm_owner_id', 'string', 'regex:/^09\d{9}$/', 'unique:users,mobile_number'],
            'email'         => 'nullable|email|unique:users,email',

            'farm_name'     => 'required|string',
            'farm_type'     => 'nullable|string',
            'farm_area'     => 'nullable|numeric',
            'farm_area_unit'=> 'nullable|in:sqm,hectare',
            'barangay'      => 'required|string',
            'lot_number'    => 'nullable|string',
            'street'        => 'nullable|string',
            'landmark'      => 'nullable|string',
            'address'       => 'nullable|string',
            'latitude'      => 'nullable|numeric',
            'longitude'     => 'nullable|numeric',
            'farm_size'     => 'required|in:Small,Medium,Large',
        ]);

        $smsSent = null;
        $delivered = null;
        $contactMethod = null;

        if ($request->farm_owner_id) {
            $user = User::where('id', $request->farm_owner_id)
                ->where('role', 'farm_owner')
                ->firstOrFail();
        } else {
            $tempPassword = Str::random(10);

            $user = User::create([
                'first_name'           => $request->first_name,
                'last_name'            => $request->last_name,
                'mobile_number'        => $request->mobile_number,
                'email'                => $request->email,
                'password'             => bcrypt($tempPassword),
                'role'                 => 'farm_owner',
                'status'               => 'active',
                'must_change_password' => true,
            ]);

            if ($user->email) {
                try {
                    Mail::to($user->email)->send(new TempPasswordMail($user, $tempPassword, 'welcome'));
                    $delivered = true;
                } catch (\Throwable $e) {
                    report($e);
                    $delivered = false;
                }
                $contactMethod = 'email';
            } else {
                $smsMessage = "Welcome to AgriBantay, {$request->first_name}! Your account is ready. Temporary password: {$tempPassword}. You will be asked to set a new password on your first visit to the AgriBantay portal.";

                $smsSent = app(SmsService::class)->send(
                    $request->mobile_number,
                    $smsMessage,
                    'Account Creation',
                    $user->id
                );
                $delivered = $smsSent;
                $contactMethod = 'sms';
            }
        }

        if ($request->filled('latitude') && $request->filled('longitude')) {
            $latitude  = $request->latitude;
            $longitude = $request->longitude;
            $fullAddress = $request->address ?: implode(', ', array_filter([
                $request->barangay, 'San Jose', 'Batangas', 'Philippines',
            ]));
        } else {
            $addressParts = array_filter([
                $request->lot_number,
                $request->street,
                $request->barangay,
                'San Jose',
                'Batangas',
                'Philippines',
            ]);
            $fullAddress = implode(', ', $addressParts);

            $coordinates = $this->geocodeWithFallback(
                $request->lot_number,
                $request->street,
                $request->barangay
            );
            $latitude  = $coordinates['latitude'] ?? null;
            $longitude = $coordinates['longitude'] ?? null;
        }

        $farm = Farm::create([
            'user_id'        => $user->id,
            'farm_name'      => $request->farm_name,
            'owner_name'     => $user->first_name . ' ' . $user->last_name,
            'mobile_number'  => $user->mobile_number,
            'barangay'       => $request->barangay,
            'address'        => $fullAddress . ($request->landmark ? " (near {$request->landmark})" : ''),
            'farm_size'      => $request->farm_size,
            'farm_type'      => $request->farm_type,
            'farm_area'      => $request->farm_area,
            'farm_area_unit' => $request->farm_area_unit ?? 'sqm',
            'status'         => 'Active',
            'latitude'       => $latitude,
            'longitude'      => $longitude,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => $request->farm_owner_id ? 'Added Farm to Existing Owner' : 'Created Farm Owner Account',
            'details' => "{$farm->farm_name} — {$user->first_name} {$user->last_name}"
                . ($contactMethod ? " — temp password sent via {$contactMethod}" : ''),
            'type'    => 'Farm',
        ]);

        return response()->json([
            'success'        => true,
            'message'        => 'Farm registered successfully.',
            'sms_sent'       => $smsSent,
            'delivered'      => $delivered,
            'contact_method' => $contactMethod,
            'data'           => ['user' => $user, 'farm' => $farm],
        ]);
    }

    public function resendSms(int $userId)
    {
        $user = User::where('id', $userId)->where('role', 'farm_owner')->firstOrFail();

        $newPassword = Str::random(10);
        $user->update(['password' => bcrypt($newPassword), 'must_change_password' => true]);

        $smsMessage = "Your new AgriBantay temporary password: {$newPassword}. You will be asked to set a new password on your next visit to the AgriBantay portal.";

        $smsSent = app(SmsService::class)->send(
            $user->mobile_number,
            $smsMessage,
            'Account Creation',
            $user->id
        );

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Resent temporary password',
            'details' => "Resent SMS to {$user->first_name} {$user->last_name}",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success'  => $smsSent,
            'message'  => $smsSent ? 'SMS resent successfully.' : 'SMS failed to send. Please try again.',
        ]);
    }

    public function show(int $id)
    {
        $farm = Farm::with([
            'user',
            'poultryHouses',
            'inspections',
            'sensors' => function ($q) {
                // Most recently registered/installed device first, so the
                // frontend can just take sensors[0] as "the" primary device
                // for farms with a single sensor.
                $q->orderByDesc('installed_at')->with('poultryHouse');
            },
            'sensorReadings' => function ($q) {
                $q->latest()->limit(1)->with('sensor.poultryHouse');
            },
        ])->findOrFail($id);

        $farm->display_status = app(FarmStatusService::class)->displayStatus($farm);
        $farm->maintenance_status = app(MaintenanceStatusService::class)->getStatus($farm);
        $farm->maintenance_logs = MaintenanceLog::where('farm_id', $farm->id)
            ->latest('performed_at')
            ->limit(5)
            ->get()
            ->map(fn($log) => [
                'id'           => $log->id,
                'performed_at' => $log->performed_at->format('M d, Y'),
                'notes'        => $log->notes,
                'photo_url'    => asset('storage/' . $log->photo_path),
            ]);

        $farm->disposal_records = ManureDisposalRecord::where('farm_id', $farm->id)
            ->latest('disposal_date')
            ->limit(5)
            ->get()
            ->map(fn($r) => [
                'id'              => $r->id,
                'disposal_method' => $r->disposal_method,
                'quantity'        => $r->quantity,
                'buyer_name'      => $r->buyer_name,
                'disposal_date'   => $r->disposal_date->format('M d, Y'),
                'notes'           => $r->notes,
            ]);

        $farm->owner_profile_photo_url = $farm->user?->profile_photo_path
            ? asset('storage/' . $farm->user->profile_photo_path)
            : null;

        return response()->json(['success' => true, 'data' => $farm]);
    }

    /**
     * Paginated clean-out history — powers the Manure Clean-out tab's
     * pagination directly (no separate "view all" modal anymore).
     */
    public function maintenanceLogs(Request $request, int $id)
    {
        Farm::findOrFail($id);

        $perPage = min((int) $request->input('per_page', 10), 50);

        $logs = MaintenanceLog::where('farm_id', $id)
            ->orderByDesc('performed_at')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => [
                'logs' => $logs->getCollection()->map(fn($log) => [
                    'id'           => $log->id,
                    'performed_at' => $log->performed_at->format('M d, Y'),
                    'notes'        => $log->notes,
                    'photo_url'    => asset('storage/' . $log->photo_path),
                ]),
                'current_page' => $logs->currentPage(),
                'last_page'    => $logs->lastPage(),
                'total'        => $logs->total(),
            ],
        ]);
    }

    /**
     * Paginated disposal records — powers the Manure Disposal tab.
     */
    public function disposalRecords(Request $request, int $id)
    {
        Farm::findOrFail($id);

        $perPage = min((int) $request->input('per_page', 10), 50);

        $records = ManureDisposalRecord::where('farm_id', $id)
            ->orderByDesc('disposal_date')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => [
                'records' => $records->getCollection()->map(fn($r) => [
                    'id'                => $r->id,
                    'disposal_method'   => $r->disposal_method,
                    'quantity'          => $r->quantity,
                    'buyer_name'        => $r->buyer_name,
                    'disposal_date'     => $r->disposal_date->format('M d, Y'),
                    'disposal_date_raw' => $r->disposal_date->toDateString(),
                    'notes'             => $r->notes,
                ]),
                'current_page' => $records->currentPage(),
                'last_page'    => $records->lastPage(),
                'total'        => $records->total(),
            ],
        ]);
    }

    public function inspectionRecords(Request $request, int $id)
    {
        Farm::findOrFail($id);

        $perPage = min((int) $request->input('per_page', 10), 50);

        $inspections = Inspection::where('farm_id', $id)
            ->orderByDesc('scheduled_at')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => [
                'inspections' => $inspections->getCollection()->map(fn($i) => [
                    'id'                  => $i->id,
                    'inspection_type'     => $i->inspection_type,
                    'status'              => $i->status,
                    'scheduled_at'        => $i->scheduled_at?->format('M d, Y'),
                    'scheduled_at_raw'    => $i->scheduled_at?->toIso8601String(),
                    'completed_at'        => $i->completed_at?->format('M d, Y'),
                    'completed_at_raw'    => $i->completed_at?->toIso8601String(),
                ]),
                'current_page' => $inspections->currentPage(),
                'last_page'    => $inspections->lastPage(),
                'total'        => $inspections->total(),
            ],
        ]);
    }

    // Vaccine/Blood Test requests are handled by the Vet role — kept out of
    // the Admin-visible list here for the same reason as
    // Admin\ServiceRequestController::VET_ONLY_TYPES. Super Admin sees all.
    private const VET_ONLY_TYPES = ['Vaccine Request', 'Blood Test Request'];

    /**
     * View-only service request history for a single farm — powers the Farm
     * Details "Service Requests" tab. No create/edit/assign actions here;
     * those remain in the main Admin > Service Requests module.
     */
    public function serviceRequests(Request $request, int $id)
    {
        Farm::findOrFail($id);

        $perPage = min((int) $request->input('per_page', 10), 50);

        $query = ServiceRequest::where('farm_id', $id)->with('acceptedBy');

        if (Auth::user()?->role === 'super_admin') {
            // Super Admin's per-farm view is a completed-service history,
            // not a working queue — Pending/Scheduled requests are still
            // actionable and belong in the main Service Requests module.
            $query->where('status', 'Completed');
        } else {
            $query->whereNotIn('service_type', self::VET_ONLY_TYPES);
        }

        $requests = $query->orderByDesc('created_at')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => [
                'requests' => $requests->getCollection()->map(fn($r) => [
                    'id'                => $r->id,
                    'request_type'      => $r->service_type,
                    'request_date'      => $r->created_at?->format('M d, Y'),
                    'request_date_raw'  => $r->created_at?->toIso8601String(),
                    'status'            => $r->status,
                    'accepted_by'       => $r->acceptedBy ? $r->acceptedBy->first_name . ' ' . $r->acceptedBy->last_name : null,
                    'completed_at'      => $r->completed_at?->format('M d, Y'),
                    'completed_at_raw'  => $r->completed_at?->toIso8601String(),
                ]),
                'current_page' => $requests->currentPage(),
                'last_page'    => $requests->lastPage(),
                'total'        => $requests->total(),
            ],
        ]);
    }

    public function trend(int $id)
    {
        Farm::findOrFail($id);
        $trend = app(TrendAnalysisService::class)->analyzeFarm($id);
        return response()->json(['success' => true, 'data' => $trend]);
    }

    public function rootCause(int $id)
    {
        $farm = Farm::with(['sensorReadings' => function ($q) {
            $q->latest()->limit(1);
        }])->findOrFail($id);

        $latestReading = $farm->sensorReadings->first();

        if (!$latestReading) {
            return response()->json([
                'success' => false,
                'message' => 'No sensor readings available for this farm yet.',
            ], 422);
        }

        $trend = app(TrendAnalysisService::class)->analyzeFarm($id);

        $diagnosis = app(RootCauseService::class)->diagnose([
            'ammonia'     => $latestReading->ammonia,
            'temperature' => $latestReading->temperature,
            'humidity'    => $latestReading->humidity,
            'moisture'    => $latestReading->moisture,
        ], $trend);

        $preventiveActions = app(PreventiveActionService::class)->suggestActions(
            $diagnosis['memberships'],
            $diagnosis['root_cause']
        );

        $explanation = app(RecommendationExplanationService::class)->explain([
            'farm_name'           => $farm->farm_name,
            'root_cause'          => $diagnosis['root_cause'],
            'trend'               => $trend,
            'recommended_action'  => $preventiveActions['overall_action'],
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'trend'              => $trend,
                'diagnosis'          => $diagnosis,
                'preventive_actions' => $preventiveActions,
                'explanation'        => $explanation,
            ],
        ]);
    }

    public function update(Request $request, int $id)
    {
        $farm = Farm::with('user')->findOrFail($id);

        // Spaces are cosmetic (e.g. "0917 123 4567") — strip them before the
        // regex check so the validation and the stored value both only see
        // the actual digits, not how the user chose to space them out.
        if ($request->filled('mobile_number')) {
            $request->merge(['mobile_number' => preg_replace('/\s+/', '', $request->mobile_number)]);
        }

        $request->validate([
            'first_name'    => 'sometimes|string',
            'last_name'     => 'sometimes|string',
            'mobile_number' => ['sometimes', 'string', 'regex:/^09\d{9}$/'],
            'farm_name'     => 'sometimes|string',
            'barangay'      => 'sometimes|string',
            'lot_number'    => 'nullable|string',
            'street'        => 'nullable|string',
            'landmark'      => 'nullable|string',
            'farm_size'     => 'sometimes|in:Small,Medium,Large',
            'profile_photo' => 'nullable|image|max:5120',
        ]);

        $farm->update($request->only([
            'farm_name', 'barangay', 'farm_size', 'mobile_number',
            'lot_number', 'street', 'landmark',
        ]));

        if ($request->barangay || $request->lot_number || $request->street) {
            $addressParts = array_filter([
                $request->lot_number,
                $request->street,
                $request->barangay ?? $farm->barangay,
                'San Jose',
                'Batangas',
                'Philippines',
            ]);
            $fullAddress = implode(', ', $addressParts);

            $coordinates = $this->geocodeWithFallback(
                $request->lot_number,
                $request->street,
                $request->barangay ?? $farm->barangay
            );

            $farm->update([
                'address'   => $fullAddress . ($request->landmark ? " (near {$request->landmark})" : ''),
                'latitude'  => $coordinates['latitude'] ?? $farm->latitude,
                'longitude' => $coordinates['longitude'] ?? $farm->longitude,
            ]);
        }

        // Email is deliberately excluded here — changing it to a NEW address
        // requires the requestOwnerEmailOtp/verifyOwnerEmailOtp flow below so
        // it's only ever saved once proven deliverable to that inbox. Clearing
        // an existing email to blank isn't a "claim" of anything, so it's
        // still allowed directly through this endpoint via clear_email.
        if ($request->first_name || $request->last_name || $request->mobile_number || $request->boolean('clear_email')) {
            $farm->user->update([
                'first_name'    => $request->first_name ?? $farm->user->first_name,
                'last_name'     => $request->last_name ?? $farm->user->last_name,
                'mobile_number' => $request->mobile_number ?? $farm->user->mobile_number,
                'email'         => $request->boolean('clear_email') ? null : $farm->user->email,
            ]);
        }

        if ($request->hasFile('profile_photo')) {
            $path = $request->file('profile_photo')->store('profile-photos', 'public');
            $farm->user->update(['profile_photo_path' => $path]);
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Updated Farm',
            'details' => "Updated farm: {$farm->farm_name}",
            'type'    => 'Farm',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Farm updated successfully.',
            'data'    => $farm,
        ]);
    }

    private const EMAIL_OTP_TTL_MINUTES = 10;

    /**
     * Step 1 of changing a farm owner's email from the Admin/Super Admin
     * Edit Account form. Mirrors SettingsController's self-service flow but
     * targets the farm's owner instead of the currently authenticated user —
     * the whole point being that Admin can't attach an email to someone
     * else's account without proving it's actually reachable first.
     */
    public function requestOwnerEmailOtp(Request $request, int $id)
    {
        $farm = Farm::with('user')->findOrFail($id);

        $request->validate([
            'email' => 'required|email',
        ]);

        $taken = User::where('email', $request->email)
            ->where('id', '!=', $farm->user_id)
            ->exists();

        if ($taken) {
            return response()->json([
                'success' => false,
                'message' => 'This email address is already used by another account.',
            ], 422);
        }

        \App\Models\EmailVerificationOtp::where('user_id', $farm->user_id)
            ->whereNull('consumed_at')
            ->update(['expires_at' => now()]);

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        \App\Models\EmailVerificationOtp::create([
            'user_id'       => $farm->user_id,
            'pending_email' => $request->email,
            'code_hash'     => \Illuminate\Support\Facades\Hash::make($code),
            'expires_at'    => now()->addMinutes(self::EMAIL_OTP_TTL_MINUTES),
        ]);

        try {
            Mail::to($request->email)->send(new \App\Mail\OtpCodeMail($farm->user, $code, 'email_verification'));
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'success' => false,
                'message' => 'Failed to send the verification code. Please try again.',
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'A verification code has been sent to this email address.',
        ]);
    }

    /**
     * Step 2 — the farm owner's email is only ever written once the code
     * matches. Re-checks uniqueness at commit time too, closing the race
     * window between request and verify.
     */
    public function verifyOwnerEmailOtp(Request $request, int $id)
    {
        $farm = Farm::with('user')->findOrFail($id);

        $request->validate([
            'email' => 'required|email',
            'code'  => 'required|string|size:6',
        ]);

        // Looked up without the expiry filter first so a genuinely expired
        // code can be told apart from a wrong one.
        $otp = \App\Models\EmailVerificationOtp::where('user_id', $farm->user_id)
            ->where('pending_email', $request->email)
            ->whereNull('consumed_at')
            ->latest()
            ->first();

        if (!$otp || !\Illuminate\Support\Facades\Hash::check($request->code, $otp->code_hash)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid verification code.',
            ], 422);
        }

        if ($otp->expires_at->isPast()) {
            return response()->json([
                'success' => false,
                'message' => 'Verification code has expired.',
            ], 422);
        }

        $taken = User::where('email', $request->email)
            ->where('id', '!=', $farm->user_id)
            ->exists();

        if ($taken) {
            return response()->json([
                'success' => false,
                'message' => 'This email address was just claimed by another account. Please try a different email.',
            ], 422);
        }

        $farm->user->update(['email' => $request->email]);
        $otp->update(['consumed_at' => now()]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Verified Farm Owner Email',
            'details' => "Updated email for {$farm->user->first_name} {$farm->user->last_name} ({$farm->farm_name})",
            'type'    => 'Account',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully.',
            'data'    => $farm->user,
        ]);
    }

    /**
     * Only Super Admin may deactivate/activate a farm owner's account —
     * regular Admin can view/create/edit but not deactivate. Enforced here
     * (not via route middleware) because /farms/{id} view/edit endpoints in
     * the same route group must stay available to both roles.
     */
    private function guardSuperAdminOnly(): ?\Illuminate\Http\JsonResponse
    {
        if (Auth::user()?->role !== 'super_admin') {
            return response()->json([
                'success' => false,
                'message' => 'Only Super Admin can deactivate or activate a farm account.',
            ], 403);
        }
        return null;
    }

    public function deactivate(int $id)
    {
        if ($blocked = $this->guardSuperAdminOnly()) return $blocked;

        $farm = Farm::findOrFail($id);
        $farm->update(['status' => 'Deactivated']);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Deactivated Farm',
            'details' => "Deactivated farm: {$farm->farm_name}",
            'type'    => 'Farm',
        ]);

        return response()->json(['success' => true, 'message' => 'Farm deactivated.']);
    }

    public function activate(int $id)
    {
        if ($blocked = $this->guardSuperAdminOnly()) return $blocked;

        $farm = Farm::findOrFail($id);
        $farm->update(['status' => 'Active']);

        return response()->json(['success' => true, 'message' => 'Farm activated.']);
    }
}