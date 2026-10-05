<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\ServiceRequest;
use Illuminate\Http\Request;
use App\Services\ReadingHistoryService;
use App\Support\LocalTime;
use App\Support\ServiceTypes;

/**
 * Read-only farm directory for the Vet role. Deliberately scoped to
 * farm/owner/location info only — no sensor readings, no current_status,
 * no maintenance/compliance data, and no edit/deactivate actions. This
 * exists so a vet can look up a farm's location/contact before or during
 * a scheduled visit, without exposing environmental monitoring data that
 * isn't relevant to their role. Compare to Admin\FarmController::index(),
 * which returns the full farm record with sensor/status data — this is
 * intentionally a much narrower subset of the same underlying data.
 */
class FarmController extends Controller
{
    public function index(Request $request)
    {
        $query = Farm::with('user')->where('status', 'Active');

        if ($request->barangay) {
            $query->where('barangay', $request->barangay);
        }

        if ($request->search) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('farm_name', 'like', "%{$s}%")
                  ->orWhere('owner_name', 'like', "%{$s}%")
                  ->orWhere('barangay', 'like', "%{$s}%");
            });
        }

        if ($request->farm_size) {
            $query->where('farm_size', $request->farm_size);
        }

        $query->orderBy('farm_name')->orderBy('id');

        // Server-side pagination when the Farms page asks for it (per_page);
        // other callers still receive the complete list.
        $paginator = null;
        if ($request->filled('per_page')) {
            $perPage = (int) $request->per_page;
            $perPage = in_array($perPage, [10, 25, 50, 100], true) ? $perPage : 10;
            $paginator = $query->paginate($perPage, ['*'], 'page', max(1, (int) $request->input('page', 1)));
            $rows = $paginator->getCollection();
        } else {
            $rows = $query->get();
        }

        $farms = $rows->map(fn($farm) => [
            'id'                       => $farm->id,
            'farm_name'                => $farm->farm_name,
            'owner_name'               => $farm->owner_name,
            'mobile_number'            => $farm->mobile_number,
            'email'                    => $farm->user?->email,
            'barangay'                 => $farm->barangay,
            'address'                  => $farm->address,
            'farm_size'                => $farm->farm_size,
            'latitude'                 => $farm->latitude,
            'longitude'                => $farm->longitude,
            'owner_profile_photo_url'  => $farm->user?->profile_photo_path
                ? asset('storage/' . $farm->user->profile_photo_path)
                : null,
        ]);

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

    /**
     * Same narrow, view-only subset as index() above — no sensor/monitoring
     * data, no edit/deactivate capability. Powers the Vet's read-only Farm
     * Details page.
     */
    /**
     * Time-series readings for the trend chart. Scoped to Active farms the
     * same way show() is, so a vet cannot pull history for a deactivated farm
     * they can no longer open. Read-only — vets never write readings.
     */
    public function readingsHistory(Request $request, int $id)
    {
        Farm::where('status', 'Active')->findOrFail($id);

        $hours = (int) $request->input('hours', ReadingHistoryService::DEFAULT_HOURS);
        $hours = max(1, min($hours, 24 * 7));

        return response()->json([
            'success' => true,
            'data'    => [
                'hours'   => $hours,
                'devices' => app(ReadingHistoryService::class)->forFarm($id, $hours),
            ],
        ]);
    }

    public function show(int $id)
    {
        $farm = Farm::with(['user', 'latestReading'])->where('status', 'Active')->findOrFail($id);

        $reading = $farm->latestReading;

        return response()->json([
            'success' => true,
            'data' => [
                // Supporting environmental context for a veterinary assessment.
                // The *_status values are the ones already computed at ingest
                // against config/sensors.php — no thresholds are evaluated here,
                // so the Vet can never see a different verdict from Admin.
                // Null when the farm has never reported, which the UI shows as
                // an empty state rather than inventing a value.
                'latest_reading' => $reading ? [
                    'ammonia'            => $reading->ammonia,
                    'ammonia_status'     => $reading->ammonia_status,
                    'temperature'        => $reading->temperature,
                    'temperature_status' => $reading->temperature_status,
                    'humidity'           => $reading->humidity,
                    'humidity_status'    => $reading->humidity_status,
                    'moisture'           => $reading->moisture,
                    'moisture_status'    => $reading->moisture_status,
                    'recorded_at'        => LocalTime::dateTime($reading->created_at),
                    'recorded_at_raw'    => $reading->created_at?->toIso8601String(),
                ] : null,
                // Which metrics may carry a Safe/Warning/Critical badge.
                // Temperature and humidity are advisory, so the Vet screen must
                // not badge them as though they had raised an alert.
                'alerting_metrics' => array_values(config('sensors.alerting_metrics', ['ammonia'])),
                // The normal band for each advisory metric, so the screen can
                // say WHICH WAY a reading is off and what it is being judged
                // against. "Outside range" alone gave a vet a verdict with no
                // scale behind it. Read from config so these can never drift
                // from the thresholds ingest actually classifies with.
                'metric_bands' => [
                    'temperature' => [
                        'low'  => config('sensors.temperature.low_safe'),
                        'high' => config('sensors.temperature.high_safe'),
                    ],
                    'humidity' => [
                        'low'  => config('sensors.humidity.low_safe'),
                        'high' => config('sensors.humidity.high_safe'),
                    ],
                ],
                'id'                      => $farm->id,
                'farm_name'               => $farm->farm_name,
                'owner_name'              => $farm->owner_name,
                // The stored columns, not a split of the joined copy above.
                // "Maria Luisa Santos" has no space that marks where the
                // first name ends, so splitting it in the UI gets it wrong.
                'owner_first_name'        => $farm->user?->first_name,
                'owner_last_name'         => $farm->user?->last_name,
                'mobile_number'           => $farm->mobile_number,
                'email'                   => $farm->user?->email,
                'barangay'                => $farm->barangay,
                'address'                 => $farm->address,
                'farm_size'               => $farm->farm_size,
                'status'                  => $farm->status,
                'created_at'              => $farm->created_at,
                'owner_profile_photo_url' => $farm->user?->profile_photo_path
                    ? asset('storage/' . $farm->user->profile_photo_path)
                    : null,
            ],
        ]);
    }

    /**
     * Vet only ever sees the two request types relevant to veterinary
     * services — the inverse of Admin\FarmController::VET_ONLY_TYPES.
     */
    public function serviceRequests(Request $request, int $id)
    {
        Farm::findOrFail($id);

        $perPage = min((int) $request->input('per_page', 10), 50);

        $requests = ServiceRequest::where('farm_id', $id)
            ->whereIn('service_type', ServiceTypes::VET)
            ->with(['acceptedBy', 'attachments.uploader'])
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => [
                'requests' => $requests->getCollection()->map(fn($r) => [
                    'id'               => $r->id,
                    'request_number'   => $r->request_number,
                    'request_type'     => $r->service_type,
                    'request_date'     => LocalTime::date($r->created_at),
                    'created_at'       => $r->created_at,
                    'scheduled_at'     => $r->scheduled_at,
                    'notes'            => $r->notes,
                    'completion_notes' => $r->completion_notes,
                    ...VaccinationRequestController::attachmentPayload($r),
                    'status'           => $r->status,
                    'accepted_by'      => $r->acceptedBy ? $r->acceptedBy->first_name . ' ' . $r->acceptedBy->last_name : null,
                    'completed_at'     => LocalTime::date($r->completed_at),
                    'completed_at_raw' => $r->completed_at,
                ]),
                'current_page' => $requests->currentPage(),
                'last_page'    => $requests->lastPage(),
                'total'        => $requests->total(),
            ],
        ]);
    }
}