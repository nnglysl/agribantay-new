<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Models\Sensor;
use App\Models\ServiceRequest;
use App\Models\SensorReading;
use App\Services\FarmStatusService;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    use ResolvesFarm;

    /** Worst-first, so the farm rolls up to its most severe house. */
    private const SEVERITY = ['Safe' => 0, 'Warning' => 1, 'Critical' => 2];

    private const METRICS = ['ammonia', 'temperature', 'humidity', 'moisture'];

    public function index(Request $request)
    {
        $farm = $this->resolveFarmOrFail($request);
        $statusService = app(FarmStatusService::class);

        // One device per poultry house, and a farm can have any number of
        // houses. Each device is reported on its own: a single "latest
        // reading for the farm" would flip between houses every minute and
        // describe none of them.
        $devices = Sensor::where('farm_id', $farm->id)
            ->where('status', 'Active')
            ->orderBy('label')
            ->orderBy('sensor_code')
            ->get();

        $perDevice = $devices->map(function (Sensor $sensor) {
            // Readings carry sensor_id from ingestion, so each house's stream
            // stays separable even after a unit is moved between farms.
            // id DESC as the tiebreaker: two readings can share a second, and
            // created_at alone then picks between them arbitrarily.
            $reading = SensorReading::where('sensor_id', $sensor->id)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->first();

            $row = [
                'device_id'       => $sensor->id,
                'device_name'     => $sensor->device_name,
                'connectivity'    => $sensor->connectivity(),
                'last_reading_at' => $reading?->created_at,
                'has_reading'     => (bool) $reading,
            ];

            foreach (self::METRICS as $metric) {
                $row[$metric] = $reading?->$metric;
                $row[$metric . '_status'] = $reading?->{$metric . '_status'};
                $row[$metric . '_direction'] = $this->direction($metric, $reading?->$metric);
            }

            return $row;
        })->values();

        // The farm is as bad as its worst house. Only the ALERTING metrics
        // count — temperature, humidity and manure moisture are shown as
        // context but no longer decide a farm's level; see
        // config('sensors.alerting_metrics') for why.
        $alerting = config('sensors.alerting_metrics', ['ammonia']);
        $worst = null;
        foreach ($perDevice as $row) {
            foreach ($alerting as $metric) {
                $status = $row[$metric . '_status'];
                if ($status === null) {
                    continue;
                }
                if ($worst === null || self::SEVERITY[$status] > self::SEVERITY[$worst]) {
                    $worst = $status;
                }
            }
        }

        $hasActiveDevice = $devices->isNotEmpty();
        $anyReading = $perDevice->contains(fn($r) => $r['has_reading']);

        // Kept from the most recent reading on the farm so callers written
        // against the single-device shape keep working. The dashboard itself
        // reads 'devices' instead.
        $latestReading = $hasActiveDevice
            ? SensorReading::where('farm_id', $farm->id)->latest()->first()
            : null;

        // Same rule as the rollup above: an advisory metric cannot pull a
        // farm's health score down, or the number would disagree with the
        // status shown beside it.
        $healthScore = 100;
        foreach ($perDevice as $row) {
            foreach ($alerting as $metric) {
                $status = $row[$metric . '_status'];
                if ($status === 'Critical') {
                    $healthScore -= 35;
                } elseif ($status === 'Warning') {
                    $healthScore -= 10;
                }
            }
        }
        $healthScore = max(0, min(100, $healthScore));

        $pendingRequests = ServiceRequest::where('farm_id', $farm->id)
            ->whereIn('status', ['Pending', 'Scheduled'])
            ->count();

        $nextScheduledVisit = ServiceRequest::where('farm_id', $farm->id)
            ->where('status', 'Scheduled')
            ->orderBy('scheduled_at')
            ->first();

        return response()->json([
            'success' => true,
            'data' => [
                'farm_id'               => $farm->id,
                'farm_name'             => $farm->farm_name,
                'barangay'              => $farm->barangay,
                'device_count'          => $devices->count(),
                'devices'               => $perDevice,
                // Which metrics the screen may badge Safe/Warning/Critical.
                // Sent from the server so the UI cannot drift out of step
                // with what actually raises alerts.
                'alerting_metrics'      => array_values(config('sensors.alerting_metrics', ['ammonia'])),
                'health_score'          => $healthScore,
                'health_status'         => !$hasActiveDevice || !$anyReading
                    ? 'Pending Setup'
                    : ($worst ?? 'Safe'),
                'ammonia'               => $latestReading?->ammonia,
                'ammonia_status'        => $latestReading?->ammonia_status,
                'temperature'           => $latestReading?->temperature,
                'temperature_status'    => $latestReading?->temperature_status,
                'humidity'              => $latestReading?->humidity,
                'humidity_status'       => $latestReading?->humidity_status,
                'moisture'              => $latestReading?->moisture,
                'moisture_status'       => $latestReading?->moisture_status,
                'pending_requests'      => $pendingRequests,
                'next_scheduled_visit'  => $nextScheduledVisit ? [
                    'service_type' => $nextScheduledVisit->service_type,
                    'scheduled_at' => $nextScheduledVisit->scheduled_at,
                ] : null,
                'last_reading_at'       => $latestReading?->created_at,
                // Device communication state — never exposes the device key.
                'connectivity'          => $statusService->connectivity($farm),
            ],
        ]);
    }

    /**
     * Which side of the safe band a reading fell off: 'high', 'low', or null
     * when it is inside the band (or there is no reading).
     *
     * The status alone says "Critical" without saying which extreme, and
     * temperature and humidity are harmful at BOTH. A farmer-facing label
     * that guessed "Too Hot" would be flatly wrong during a cold snap, so
     * the side is decided here — next to the same config the classification
     * itself uses — rather than re-derived from thresholds in the frontend.
     *
     * Ammonia and moisture are one-sided: only "too much" is a problem.
     */
    private function direction(string $metric, $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $t = config("sensors.$metric");

        if (isset($t['low_safe'], $t['high_safe'])) {
            if ($value < $t['low_safe']) {
                return 'low';
            }
            return $value > $t['high_safe'] ? 'high' : null;
        }

        // One-sided: anything at or above the warning cut is "too high".
        return isset($t['warning']) && $value >= $t['warning'] ? 'high' : null;
    }
}
