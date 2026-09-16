<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\User;
use App\Models\ActivityLog;
use App\Services\SmsService;
use App\Services\FarmStatusService;
use App\Services\GeocodingService;
use App\Services\FarmLocationService;
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
use Illuminate\Validation\Rule;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

class FarmController extends Controller
{
    // Farms list: columns the table may sort by, the page sizes its pager
    // offers, and the timezone its registration-date filter is expressed
    // in (created_at is stored in UTC).
    private const SORTABLE_COLUMNS = ['farm_name', 'owner_name', 'barangay', 'farm_size', 'created_at'];
    private const PAGE_SIZES = [10, 25, 50, 100];
    private const DISPLAY_TIMEZONE = 'Asia/Manila';

    public function index(Request $request)
    {
        $query = Farm::with(['user', 'sensors', 'latestReading', 'sensorReadings' => function ($q) {
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

        // Every filter runs in SQL so a paginated page is cut from the
        // complete, already-filtered dataset (counts stay exact).
        if ($request->farm_size) {
            $query->where('farm_size', $request->farm_size);
        }

        // Monitoring status is derived (FarmStatusService::displayStatus):
        // "Pending Setup" = no Active device OR no reading yet; otherwise the
        // farm's current_status. Expressed here as the equivalent SQL so the
        // filter can apply before pagination instead of after fetching all rows.
        if ($request->monitoring_status) {
            $hasActiveDevice = fn ($q) => $q->whereHas('sensors', fn ($s) => $s->where('status', 'Active'));
            if ($request->monitoring_status === 'Pending Setup') {
                $query->where(function ($q) {
                    $q->whereDoesntHave('sensors', fn ($s) => $s->where('status', 'Active'))
                      ->orWhereDoesntHave('sensorReadings');
                });
            } else {
                $query->where(function ($q) use ($hasActiveDevice, $request) {
                    $hasActiveDevice($q)->whereHas('sensorReadings')->where('current_status', $request->monitoring_status);
                });
            }
        }

        // Registration-date range, inclusive, as calendar days in the LGU's
        // local timezone (the app stores UTC). Matches what the table shows.
        if ($request->from || $request->to) {
            $tz = self::DISPLAY_TIMEZONE;
            if ($request->from) {
                $query->where('created_at', '>=', Carbon::parse($request->from, $tz)->startOfDay()->utc());
            }
            if ($request->to) {
                $query->where('created_at', '<=', Carbon::parse($request->to, $tz)->endOfDay()->utc());
            }
        }

        // Sorting: whitelisted columns only; anything else falls back to the
        // original newest-first order.
        $sort = $request->input('sort');
        $dir = strtolower((string) $request->input('dir', 'asc')) === 'desc' ? 'desc' : 'asc';
        if (in_array($sort, self::SORTABLE_COLUMNS, true)) {
            $query->orderBy($sort, $dir)->orderBy('id', 'desc');
        } else {
            $query->latest();
        }

        // Server-side pagination when the caller asks for it (Farms pages).
        // Callers that omit per_page (farm dropdowns, device assignment)
        // still get the complete list exactly as before.
        $paginator = null;
        if ($request->filled('per_page')) {
            $perPage = (int) $request->per_page;
            $perPage = in_array($perPage, self::PAGE_SIZES, true) ? $perPage : 10;
            $paginator = $query->paginate($perPage, ['*'], 'page', max(1, (int) $request->input('page', 1)));
            $farms = $paginator->getCollection();
        } else {
            $farms = $query->get();
        }

        $statusService = app(FarmStatusService::class);

        // Ingest already keeps current_status in step with each new reading;
        // this read-side sync is the same safety net as before, now only
        // for the rows being returned.
        foreach ($farms as $farm) {
            $statusService->syncStatus($farm);
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
                'device_name' => $sensor?->device_name,
                'connectivity' => $statusService->connectivity($farm),
                'last_seen_at' => $statusService->lastSeenAt($farm),
                'ammonia'     => $latestReading?->ammonia,
                'ammonia_status' => $latestReading?->ammonia_status,
                'sensor_status'  => $displayStatus,
                'created_at'  => $farm->created_at,
            ];
        });

        if ($paginator) {
            return response()->json([
                'success' => true,
                'data'    => [
                    'items'     => $farms->values(),
                    'total'     => $paginator->total(),
                    'page'      => $paginator->currentPage(),
                    'per_page'  => $paginator->perPage(),
                    'last_page' => max(1, $paginator->lastPage()),
                ],
            ]);
        }

        return response()->json(['success' => true, 'data' => $farms]);
    }

    public function mapData()
    {
        $farms = Farm::whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->with(['sensors', 'latestReading', 'sensorReadings' => function ($q) {
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

        return response()->json([
            'success' => true,
            'data'    => $farms,
            // Lets the Location Preview run the same "area already marked"
            // proximity check the server enforces on save.
            'duplicate_radius_meters' => app(FarmLocationService::class)->radiusMeters(),
        ]);
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
        // Spaces/dashes are cosmetic (e.g. "0917 123 4567", "0917-123-4567") —
        // normalize to digits before the regex and uniqueness checks so
        // formatting can never disguise an already-registered number.
        if ($request->filled('mobile_number')) {
            $request->merge(['mobile_number' => User::normalizeMobileNumber($request->mobile_number)]);
        }

        $location = app(FarmLocationService::class);

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
            // Only the 33 official barangays (config/geography.php) — a
            // hand-crafted request can't smuggle in a made-up one.
            'barangay'      => ['required', 'string', Rule::in($location->officialBarangays())],
            'lot_number'    => 'nullable|string',
            'street'        => 'nullable|string',
            'landmark'      => 'nullable|string',
            'address'       => 'nullable|string',
            'latitude'      => 'nullable|numeric|between:-90,90|required_with:longitude',
            'longitude'     => 'nullable|numeric|between:-180,180|required_with:latitude',
            'farm_size'     => 'required|in:Small,Medium,Large',
        ], [
            'barangay.in' => FarmLocationService::INVALID_BARANGAY_MESSAGE,
        ]);

        // Resolve the pin BEFORE creating anything: a location conflict must
        // reject the whole request without leaving a stray owner account.
        // Same composition as update(), so a farm's address reads identically
        // whether it was just registered or later edited. A free-text
        // `address` is only honoured when no structured parts were given.
        $addressParts = array_filter([
            $request->lot_number,
            $request->street,
            $request->barangay,
            'San Jose',
            'Batangas',
            'Philippines',
        ]);
        $fullAddress = (!$request->lot_number && !$request->street && $request->address)
            ? $request->address
            : implode(', ', $addressParts);

        if ($request->filled('latitude') && $request->filled('longitude')) {
            $latitude  = $request->latitude;
            $longitude = $request->longitude;
        } else {
            $coordinates = $this->geocodeWithFallback(
                $request->lot_number,
                $request->street,
                $request->barangay
            );
            $latitude  = $coordinates['latitude'] ?? null;
            $longitude = $coordinates['longitude'] ?? null;
        }

        // A farm can't be saved without a pin: the frontend always sends
        // one, and the geocode fallback above covers direct API callers.
        if ($latitude === null || $longitude === null) {
            throw ValidationException::withMessages([
                'location' => ['A pinned location is required before this farm can be saved.'],
            ]);
        }

        // Ordered location rules — inside San Jose, official barangay,
        // barangay <-> pin consistency, then the one-farm-per-area check.
        // Any failure is a 422 before an owner account or farm is written.
        $locationCheck = $location->assertValidLocation((float) $latitude, (float) $longitude, $request->barangay);

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

        $farm = Farm::create([
            'user_id'        => $user->id,
            'farm_name'      => $request->farm_name,
            'owner_name'     => $user->first_name . ' ' . $user->last_name,
            'mobile_number'  => $user->mobile_number,
            'barangay'       => $request->barangay,
            'address'        => $fullAddress . ($request->landmark ? " (near {$request->landmark})" : ''),
            'lot_number'     => $request->lot_number,
            'street'         => $request->street,
            'landmark'       => $request->landmark,
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
            'location'       => $locationCheck,
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

        $statusService = app(FarmStatusService::class);
        $farm->display_status = $statusService->displayStatus($farm);
        // Device communication state (Pending Setup / Online / Offline) —
        // derived from sensors.last_seen_at, not from whether a reading exists.
        $farm->connectivity = $statusService->connectivity($farm);
        $farm->last_seen_at = $statusService->lastSeenAt($farm);
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

        // Spaces/dashes are cosmetic (e.g. "0917 123 4567", "0917-123-4567") —
        // normalize to digits before the regex and uniqueness checks so
        // formatting can never disguise an already-registered number.
        if ($request->filled('mobile_number')) {
            $request->merge(['mobile_number' => User::normalizeMobileNumber($request->mobile_number)]);
        }

        $location = app(FarmLocationService::class);

        $request->validate([
            'first_name'    => 'sometimes|string',
            'last_name'     => 'sometimes|string',
            // Ignore the farm's own owner so re-saving an unchanged number
            // passes; another owner already holding it must be rejected here
            // rather than surfacing as a raw DB integrity error.
            'mobile_number' => [
                'sometimes', 'string', 'regex:/^09\d{9}$/',
                Rule::unique('users', 'mobile_number')->ignore($farm->user_id),
            ],
            'farm_name'     => 'sometimes|string',
            'barangay'      => ['sometimes', 'string', Rule::in($location->officialBarangays())],
            'lot_number'    => 'nullable|string',
            'street'        => 'nullable|string',
            'landmark'      => 'nullable|string',
            'farm_size'     => 'sometimes|in:Small,Medium,Large',
            'latitude'      => 'nullable|numeric|between:-90,90|required_with:longitude',
            'longitude'     => 'nullable|numeric|between:-180,180|required_with:latitude',
            'profile_photo' => 'nullable|image|max:5120',
        ], [
            'barangay.in' => FarmLocationService::INVALID_BARANGAY_MESSAGE,
        ]);

        // Work out where the pin will end up before writing anything, so a
        // location conflict rejects the request as a clean 422. A pin sent
        // explicitly (marker dragged on the edit form) wins; otherwise the
        // address is re-geocoded — but ONLY when lot/street/barangay actually
        // differ from what's stored. The edit form always re-sends them, and
        // lot/purok-level queries rarely resolve, so re-geocoding an unchanged
        // address would snap the pin back to the barangay centroid on every
        // save (discarding a dragged pin, and colliding with any other farm
        // in the same barangay that fell back to the same centroid).
        $pinnedByUser = $request->filled('latitude') && $request->filled('longitude');
        $addressChanged = false;
        foreach (['barangay', 'lot_number', 'street'] as $part) {
            if ($request->has($part) && trim((string) $request->input($part)) !== trim((string) $farm->{$part})) {
                $addressChanged = true;
                break;
            }
        }

        $newLatitude  = $farm->latitude;
        $newLongitude = $farm->longitude;
        $fullAddress  = null;

        $part = fn (string $k) => $request->has($k) ? $request->input($k) : $farm->{$k};

        if ($addressChanged || $request->has('landmark')) {
            $addressParts = array_filter([
                $part('lot_number'),
                $part('street'),
                $part('barangay'),
                'San Jose',
                'Batangas',
                'Philippines',
            ]);
            $fullAddress = implode(', ', $addressParts);
        }

        if ($pinnedByUser) {
            $newLatitude  = $request->latitude;
            $newLongitude = $request->longitude;
        } elseif ($addressChanged) {
            $coordinates = $this->geocodeWithFallback(
                $part('lot_number'),
                $part('street'),
                $part('barangay')
            );
            $newLatitude  = $coordinates['latitude'] ?? $farm->latitude;
            $newLongitude = $coordinates['longitude'] ?? $farm->longitude;
        }

        // Location rules run when the pin or the barangay is actually
        // changing. An edit that leaves both alone (owner details, farm
        // size, landmark…) must keep saving even for farms registered before
        // these rules existed, whose stored pin may not pass them today.
        // The farm's own current pin never counts against it in the
        // one-farm-per-area check, so an unchanged location always passes.
        $pinChanged = $newLatitude !== null && $newLongitude !== null && (
            $farm->latitude === null || $farm->longitude === null
            || $location->distanceMeters((float) $newLatitude, (float) $newLongitude, (float) $farm->latitude, (float) $farm->longitude) > 1
        );
        $barangayChanged = $request->has('barangay') && $request->input('barangay') !== $farm->barangay;

        $locationCheck = null;
        if ($pinChanged || $barangayChanged) {
            if ($newLatitude === null || $newLongitude === null) {
                throw ValidationException::withMessages([
                    'location' => ['A pinned location is required before this farm can be saved.'],
                ]);
            }
            $locationCheck = $location->assertValidLocation((float) $newLatitude, (float) $newLongitude, $part('barangay'), $farm->id);
        } elseif ($newLatitude !== null && $newLongitude !== null) {
            $location->assertLocationAvailable((float) $newLatitude, (float) $newLongitude, $farm->id);
        }

        $farm->update($request->only([
            'farm_name', 'barangay', 'farm_size', 'mobile_number',
            'lot_number', 'street', 'landmark',
        ]));

        $locationUpdate = [];
        if ($fullAddress !== null) {
            $landmark = $part('landmark');
            $locationUpdate['address'] = $fullAddress . ($landmark ? " (near {$landmark})" : '');
        }
        if ($pinnedByUser || $addressChanged) {
            $locationUpdate['latitude']  = $newLatitude;
            $locationUpdate['longitude'] = $newLongitude;
        }
        if ($locationUpdate) {
            $farm->update($locationUpdate);
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
            'success'  => true,
            'message'  => 'Farm updated successfully.',
            'location' => $locationCheck,
            'data'     => $farm,
        ]);
    }

    /**
     * Live check behind the Location Preview: the frontend calls this
     * (debounced) whenever the pin or barangay changes so the user sees the
     * same verdict — outside / mismatch / duplicate / verified / unverified —
     * that store()/update() will enforce on save. Nothing is written.
     */
    public function checkLocation(Request $request)
    {
        $location = app(FarmLocationService::class);

        $request->validate([
            'latitude'        => 'required|numeric|between:-90,90',
            'longitude'       => 'required|numeric|between:-180,180',
            'barangay'        => ['required', 'string', Rule::in($location->officialBarangays())],
            'exclude_farm_id' => 'nullable|integer|exists:farms,id',
        ], [
            'barangay.in' => FarmLocationService::INVALID_BARANGAY_MESSAGE,
        ]);

        return response()->json([
            'success' => true,
            'data'    => $location->validate(
                (float) $request->latitude,
                (float) $request->longitude,
                $request->barangay,
                $request->exclude_farm_id ? (int) $request->exclude_farm_id : null
            ),
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