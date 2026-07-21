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
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;

class FarmController extends Controller
{
    public function index(Request $request)
    {
        $query = Farm::with(['user', 'sensorReadings' => function ($q) {
            $q->latest()->limit(1);
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

        foreach ($farms as $farm) {
            app(FarmStatusService::class)->syncStatus($farm);
        }

        $farms = $farms->map(function ($farm) {
            $latestReading = $farm->sensorReadings->first();
            return [
                'id'          => $farm->id,
                'farm_name'   => $farm->farm_name,
                'owner_name'  => $farm->owner_name,
                'mobile_number' => $farm->mobile_number,
                'barangay'    => $farm->barangay,
                'address'     => $farm->address,
                'num_birds'   => $farm->num_birds,
                'farm_size'   => $farm->farm_size,
                'farm_type'   => $farm->farm_type,
                'farm_area'   => $farm->farm_area,
                'farm_area_unit' => $farm->farm_area_unit,
                'status'      => $farm->status,
                'current_status' => $farm->current_status,
                'ammonia'     => $latestReading?->ammonia,
                'ammonia_status' => $latestReading?->ammonia_status,
                'sensor_status'  => $latestReading?->ammonia_status ?? 'Offline',
                'created_at'  => $farm->created_at,
            ];
        });

        return response()->json(['success' => true, 'data' => $farms]);
    }

    public function mapData()
    {
        $farms = Farm::whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->with(['sensorReadings' => function ($q) {
                $q->latest()->limit(1);
            }])
            ->get();

        foreach ($farms as $farm) {
            app(FarmStatusService::class)->syncStatus($farm);
        }

        $farms = $farms->map(fn($f) => [
                'id'             => $f->id,
                'farm_name'      => $f->farm_name,
                'owner_name'     => $f->owner_name,
                'latitude'       => $f->latitude,
                'longitude'      => $f->longitude,
                'current_status' => $f->current_status,
            ]);

        return response()->json(['success' => true, 'data' => $farms]);
    }

    /**
     * Geocode an address, falling back to barangay-only if the full
     * address fails to resolve (common for sparse rural addresses).
     * Only used when the frontend didn't already supply lat/lng itself
     * (the new farm-registration flow geotags client-side via Nominatim
     * autocomplete and sends coordinates directly).
     */
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
     * Creates a farm. Supports two flows:
     *
     *  - New flow: `farm_owner_id` is provided (owner was already created
     *    via POST /admin/farm-owners in a previous request). No new User
     *    is created here, no SMS is sent — this call just attaches a farm
     *    to that existing owner. Latitude/longitude, when provided, are
     *    used as-is (already geotagged client-side).
     *
     *  - Legacy flow: no `farm_owner_id` — first_name/last_name/mobile_number
     *    are required and a new owner + farm are created together in one
     *    call, exactly as before. Kept for backward compatibility.
     */
    public function store(Request $request)
    {
        $request->validate([
            'farm_owner_id' => 'nullable|exists:users,id',

            'first_name'    => 'required_without:farm_owner_id|string',
            'last_name'     => 'required_without:farm_owner_id|string',
            'mobile_number' => 'required_without:farm_owner_id|string|unique:users,mobile_number',

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

        if ($request->farm_owner_id) {
            // New flow — owner already exists.
            $user = User::where('id', $request->farm_owner_id)
                ->where('role', 'farm_owner')
                ->firstOrFail();
        } else {
            // Legacy flow — create the owner inline, same as before.
            $tempPassword = Str::random(10);

            $user = User::create([
                'first_name'           => $request->first_name,
                'last_name'            => $request->last_name,
                'mobile_number'        => $request->mobile_number,
                'password'             => bcrypt($tempPassword),
                'role'                 => 'farm_owner',
                'status'               => 'active',
                'must_change_password' => true,
            ]);

            $smsMessage = "Welcome to AgriBantay, {$request->first_name}! Your account is ready. Temporary password: {$tempPassword}. You will be asked to set a new password on your first visit to the AgriBantay portal.";

            $smsSent = app(SmsService::class)->send(
                $request->mobile_number,
                $smsMessage,
                'Account Creation',
                $user->id
            );
        }

        // Location: prefer coordinates the frontend already resolved via
        // its own address-autocomplete geotagging; otherwise fall back to
        // server-side geocoding from barangay/lot/street (legacy path).
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
            'role'    => 'admin',
            'action'  => $request->farm_owner_id ? 'Added Farm to Existing Owner' : 'Created Farm Owner Account',
            'details' => "{$farm->farm_name} — {$user->first_name} {$user->last_name}",
            'type'    => 'Farm',
        ]);

        return response()->json([
            'success'  => true,
            'message'  => 'Farm registered successfully.',
            'sms_sent' => $smsSent, // null when reusing an existing owner (no SMS sent this call)
            'data'     => ['user' => $user, 'farm' => $farm],
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
            'role'    => 'admin',
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
            'sensors.poultryHouse',
            'sensorReadings' => function ($q) {
                $q->latest()->limit(1)->with('sensor.poultryHouse');
            },
        ])->findOrFail($id);

        // Objective 3.2 — same computed status the Farm Owner sees,
        // shown here read-only for oversight. No new logic — reuses
        // the exact same service, just a different consumer.
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

        // Objective 3.3 — read-only for Admin/Super Admin. Compliance
        // visibility into how each farm actually handles its manure,
        // not a service the LGU performs (farmers sell/compost their
        // own manure; there's no municipal pickup for it).
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

        return response()->json(['success' => true, 'data' => $farm]);
    }

    /**
     * Trend Analysis — AI-Assisted Insight Layer, step 1. Returns
     * direction/rate/projected-time-to-critical for each sensor type,
     * computed by TrendAnalysisService from this farm's recent readings.
     * Root Cause and Recommendation Explanation (steps 2-3) build on
     * top of this endpoint's output rather than duplicating the math.
     */
    public function trend(int $id)
    {
        Farm::findOrFail($id); // 404s cleanly if the farm doesn't exist

        $trend = app(TrendAnalysisService::class)->analyzeFarm($id);

        return response()->json(['success' => true, 'data' => $trend]);
    }

    /**
     * AI-Assisted Insight Layer, step 2. Combines Trend Analysis with
     * RootCauseService's fuzzy diagnosis in one response — kept separate
     * from trend() so that already-working endpoint stays untouched.
     */
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

        // AI-Assisted Insight Layer, step 4. Gemini only ever writes
        // prose for the diagnosis already decided above — it never
        // determines the root cause or the action itself. Returns null
        // (not an error) if the API call fails for any reason, so the
        // deterministic diagnosis/actions above still work on their own.
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
        $farm = Farm::findOrFail($id);

        $request->validate([
            'first_name'    => 'sometimes|string',
            'last_name'     => 'sometimes|string',
            'mobile_number' => 'sometimes|string',
            'farm_name'     => 'sometimes|string',
            'barangay'      => 'sometimes|string',
            'lot_number'    => 'nullable|string',
            'street'        => 'nullable|string',
            'landmark'      => 'nullable|string',
            'farm_size'     => 'sometimes|in:Small,Medium,Large',
        ]);

        $farm->update($request->only([
            'farm_name', 'barangay', 'farm_size', 'mobile_number',
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

        if ($request->first_name || $request->last_name) {
            $farm->user->update([
                'first_name'    => $request->first_name ?? $farm->user->first_name,
                'last_name'     => $request->last_name ?? $farm->user->last_name,
                'mobile_number' => $request->mobile_number ?? $farm->user->mobile_number,
            ]);
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
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

    public function deactivate(int $id)
    {
        $farm = Farm::findOrFail($id);
        $farm->update(['status' => 'Deactivated']);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => 'admin',
            'action'  => 'Deactivated Farm',
            'details' => "Deactivated farm: {$farm->farm_name}",
            'type'    => 'Farm',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Farm deactivated.',
        ]);
    }

    public function activate(int $id)
    {
        $farm = Farm::findOrFail($id);
        $farm->update(['status' => 'Active']);

        return response()->json([
            'success' => true,
            'message' => 'Farm activated.',
        ]);
    }
}