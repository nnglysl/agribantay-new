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
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;

class FarmController extends Controller
{
    public function index(Request $request)
    {
        $query = Farm::with(['user', 'sensorReadings' => function ($q) {
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

        foreach ($farms as $farm) {
            app(FarmStatusService::class)->syncStatus($farm);
        }

        if ($request->monitoring_status) {
            $farms = $farms->filter(fn($f) => $f->current_status === $request->monitoring_status)->values();
        }

        if ($request->farm_size) {
            $farms = $farms->filter(fn($f) => $f->farm_size === $request->farm_size)->values();
        }

        $farms = $farms->map(function ($farm) {
            $latestReading = $farm->sensorReadings->first();
            $sensor = $latestReading?->sensor;

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
                'current_status' => $farm->current_status,
                'device_name' => $sensor?->label ?? $sensor?->sensor_code ?? null,
                'ammonia'     => $latestReading?->ammonia,
                'ammonia_status' => $latestReading?->ammonia_status,
                'sensor_status'  => $farm->current_status ?? 'Offline',
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
            $user = User::where('id', $request->farm_owner_id)
                ->where('role', 'farm_owner')
                ->firstOrFail();
        } else {
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
            'sms_sent' => $smsSent,
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
                    'id'              => $r->id,
                    'disposal_method' => $r->disposal_method,
                    'quantity'        => $r->quantity,
                    'buyer_name'      => $r->buyer_name,
                    'disposal_date'   => $r->disposal_date->format('M d, Y'),
                    'notes'           => $r->notes,
                ]),
                'current_page' => $records->currentPage(),
                'last_page'    => $records->lastPage(),
                'total'        => $records->total(),
            ],
        ]);
    }

    /**
     * Paginated inspection records — powers the Inspections tab.
     */
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
                    'id'              => $i->id,
                    'inspection_type' => $i->inspection_type,
                    'status'          => $i->status,
                    'scheduled_at'    => $i->scheduled_at?->format('M d, Y'),
                    'completed_at'    => $i->completed_at?->format('M d, Y'),
                ]),
                'current_page' => $inspections->currentPage(),
                'last_page'    => $inspections->lastPage(),
                'total'        => $inspections->total(),
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

        $request->validate([
            'first_name'    => 'sometimes|string',
            'last_name'     => 'sometimes|string',
            'mobile_number' => 'sometimes|string',
            'email'         => 'nullable|email|unique:users,email,' . $farm->user_id,
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

        if ($request->first_name || $request->last_name || $request->filled('email')) {
            $farm->user->update([
                'first_name'    => $request->first_name ?? $farm->user->first_name,
                'last_name'     => $request->last_name ?? $farm->user->last_name,
                'mobile_number' => $request->mobile_number ?? $farm->user->mobile_number,
                'email'         => $request->filled('email') ? $request->email : $farm->user->email,
            ]);
        }

        if ($request->hasFile('profile_photo')) {
            $path = $request->file('profile_photo')->store('profile-photos', 'public');
            $farm->user->update(['profile_photo_path' => $path]);
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

        return response()->json(['success' => true, 'message' => 'Farm deactivated.']);
    }

    public function activate(int $id)
    {
        $farm = Farm::findOrFail($id);
        $farm->update(['status' => 'Active']);

        return response()->json(['success' => true, 'message' => 'Farm activated.']);
    }
}