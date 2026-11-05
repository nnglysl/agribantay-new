<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Models\Sensor;
use App\Models\ServiceRequest;
use App\Services\CurrentMonitoringService;
use App\Services\FarmStatusService;
use App\Services\HouseMonitoringService;
use App\Services\MaintenanceStatusService;
use App\Services\MonitoringAssessmentService;
use App\Services\MonitoringDeploymentService;
use App\Support\ServiceTypes;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    use ResolvesFarm;

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

        $perDevice = $devices->map(function (Sensor $sensor) use ($farm) {
            // Readings carry sensor_id from ingestion, so each house's stream
            // stays separable even after a unit is moved between farms.
            // id DESC as the tiebreaker: two readings can share a second, and
            // created_at alone then picks between them arbitrarily.
            $reading = app(CurrentMonitoringService::class)->latest($sensor, $farm->id);

            $row = [
                'device_id' => $sensor->id,
                'device_name' => $sensor->device_name,
                'connectivity' => $sensor->connectivity(),
                'last_reading_at' => $reading?->created_at,
                'has_reading' => (bool) $reading,
            ];
            $row['primary_assessment'] = app(MonitoringAssessmentService::class)->device($sensor, $reading);

            foreach (self::METRICS as $metric) {
                $row[$metric] = $reading?->$metric;
                $row[$metric.'_status'] = $reading?->{$metric.'_status'};
                $row[$metric.'_direction'] = $this->direction($metric, $reading?->$metric);
            }

            return $row;
        })->values();

        $alerting = config('sensors.alerting_metrics', ['ammonia']);
        $hasActiveDevice = $devices->isNotEmpty();

        $latestReading = $hasActiveDevice
            ? app(CurrentMonitoringService::class)->forFarm($farm)->orderByDesc('created_at')->orderByDesc('id')->first()
            : null;


        $healthScore = 100;
        foreach ($perDevice as $row) {
            foreach ($alerting as $metric) {
                $status = in_array($metric, $row['primary_assessment']['available_primary_metrics'], true)
                    ? $row[$metric.'_status'] : null;
                if ($status === 'Critical') {
                    $healthScore -= 35;
                } elseif ($status === 'Warning') {
                    $healthScore -= 10;
                }
            }
        }
        $healthScore = max(0, min(100, $healthScore));

        $pendingRequests = ServiceRequest::whereIn('service_type', ServiceTypes::VET)->where('farm_id', $farm->id)
            ->whereIn('status', ['Pending', 'Scheduled'])
            ->count();

        $nextScheduledVisit = ServiceRequest::whereIn('service_type', ServiceTypes::VET)->where('farm_id', $farm->id)
            ->where('status', 'Scheduled')
            ->orderBy('scheduled_at')
            ->first();


        $previousMonitoring = null;
        if (! $hasActiveDevice) {
            $latest = collect(app(MonitoringDeploymentService::class)->forFarm($farm->id))
                ->filter(fn ($period) => $period['reading_count'] > 0)
                ->sortBy('last_reading_at')->last();

            if ($latest) {
                $previousMonitoring = [
                    'from' => $latest['first_reading_at'],
                    'to' => $latest['last_reading_at'],
                    'reading_count' => $latest['reading_count'],
                ];
            }
        }

        $assessment = app(MonitoringAssessmentService::class)->farm($farm);
        $houseMonitoring = app(HouseMonitoringService::class)->snapshot($request->user(), $farm->id);
        $perDevice = $perDevice->map(function ($device) use ($houseMonitoring) {
            $row = collect($houseMonitoring['rows'])->first(fn ($row) => $row['poultry_house_id'] !== null && $row['assignment_verified'] && $row['device_id'] === $device['device_id']);
            $device['poultry_house_name'] = $row['house_name'] ?? null;

            return $device;
        });

        return response()->json([
            'success' => true,
            'data' => [
                'farm_id' => $farm->id,
                'house_monitoring' => $houseMonitoring,
                'cleanout_compliance' => app(MaintenanceStatusService::class)->getStatus($farm),
                'farm_name' => $farm->farm_name,
                'barangay' => $farm->barangay,
                'device_count' => $devices->count(),
                'devices' => $perDevice,
                // Which metrics the screen may badge Safe/Warning/Critical.
                // Sent from the server so the UI cannot drift out of step
                // with what actually raises alerts.
                'alerting_metrics' => array_values(config('sensors.alerting_metrics', ['ammonia'])),
                'health_score' => $assessment['data_completeness'] === 'Complete' ? $healthScore : null,
                'monitoring_assessment' => $assessment,
                'health_status' => $assessment['condition'],
                'ammonia' => $latestReading?->ammonia,
                'ammonia_status' => $latestReading?->ammonia_status,
                'temperature' => $latestReading?->temperature,
                'temperature_status' => $latestReading?->temperature_status,
                'humidity' => $latestReading?->humidity,
                'humidity_status' => $latestReading?->humidity_status,
                'moisture' => $latestReading?->moisture,
                'moisture_status' => $latestReading?->moisture_status,
                'pending_requests' => $pendingRequests,
                'next_scheduled_visit' => $nextScheduledVisit ? [
                    'service_type' => $nextScheduledVisit->service_type,
                    'scheduled_at' => $nextScheduledVisit->scheduled_at,
                ] : null,
                'last_reading_at' => $latestReading?->created_at,
                // Null while a device is installed; a date range once the
                // rotation has moved it on. See where it is built above.
                'previous_monitoring' => $previousMonitoring,
                // Device communication state — never exposes the device key.
                'connectivity' => $statusService->connectivity($farm),
            ],
        ]);
    }

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

        return isset($t['warning']) && $value >= $t['warning'] ? 'high' : null;
    }
}
