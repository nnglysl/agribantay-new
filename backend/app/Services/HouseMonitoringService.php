<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use App\Support\DummyHouseInventory;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Read-only presentation. Never used to change alert/SMS aggregation. */
class HouseMonitoringService
{
    private const METRICS = ['ammonia', 'moisture', 'temperature', 'humidity'];

    private function farm(User $actor, int $farmId): Farm
    {
        $actor = User::findOrFail($actor->id);
        abort_unless($actor->status === 'active' && in_array($actor->role, ['admin', 'super_admin', 'farm_owner', 'vet'], true), 403);
        $query = Farm::whereKey($farmId);
        if ($actor->role === 'farm_owner') {
            $query->where('user_id', $actor->id);
        } elseif ($actor->role === 'vet') {
            $query->where('status', 'Active');
        }

        return $query->firstOrFail();
    }

    private function reading(?SensorReading $reading, string $houseName, ?string $deviceName = null): ?array
    {
        if (! $reading) {
            return null;
        }
        $result = ['id' => $reading->id, 'farm_id' => $reading->farm_id, 'sensor_id' => $reading->sensor_id,
            'poultry_house_id' => $reading->poultry_house_id, 'assignment_event_id' => $reading->assignment_event_id,
            'house_name' => $houseName, 'device_name' => $deviceName, 'recorded_at' => $reading->created_at?->toISOString(),
            'primary_assessment' => app(MonitoringAssessmentService::class)->reading($reading)];
        foreach (self::METRICS as $metric) {
            $result[$metric] = $reading->{$metric};
            $result[$metric.'_status'] = $reading->{$metric.'_status'};
        }

        return $result;
    }

    private function row(?object $house, ?Sensor $sensor, ?object $event, bool $verified, int $assignmentVersion = 0): array
    {
        $name = $house ? 'House '.$house->house_number : 'House not recorded';
        $query = SensorReading::where('farm_id', $sensor?->farm_id)->where('sensor_id', $sensor?->id)->where('created_at', '<=', now());
        if ($house) {
            $valid = $verified && $event && (int) $event->sensor_id === (int) $sensor?->id
                && (int) $event->to_farm_id === (int) $house->farm_id && (int) $event->to_house_id === (int) $house->id
                && (int) $event->id === $assignmentVersion;
            $query->where('poultry_house_id', $house->id)->where('assignment_event_id', $event?->id)
                ->where('id', '>', $event?->reading_floor_id ?? PHP_INT_MAX);
            $last = $valid ? $query->latest('created_at')->latest('id')->first() : null;
        } else {
            $last = $sensor?->isActive() ? app(CurrentMonitoringService::class)->latest($sensor, $sensor->farm_id) : null;
        }
        $active = $sensor?->isActive() && (! $house || ($verified && $valid && $house->status === 'Active'));
        $fresh = $active && $last && $last->created_at->gt(now()->subMinutes(config('sensors.offline_after_minutes', 3)));
        $assessment = app(MonitoringAssessmentService::class)->reading($fresh ? $last : null);
        $state = $house?->status === 'Inactive' || (! $house && $sensor && ! $sensor->isActive()) ? 'Inactive'
            : (! $active ? 'Not Monitored' : (! $last ? 'No Readings Yet' : (! $fresh ? 'Offline' : $assessment['condition'])));

        return ['key' => $house ? 'house:'.$house->id : 'legacy:'.$sensor->id,
            'poultry_house_id' => $house?->id, 'house_name' => $name, 'house_status' => $house?->status,
            'device_id' => $sensor?->id, 'device_name' => $sensor?->device_name, 'device_status' => $sensor?->status,
            'assignment_event_id' => $house ? $event?->id : null, 'state' => $state, 'assignment_verified' => $house ? $valid : false,
            'connectivity' => ! $active ? 'Not applicable' : ($fresh ? 'Online' : ($last ? 'Offline' : 'Awaiting first reading')),
            'current_reading' => $this->reading($fresh ? $last : null, $name, $sensor?->device_name),
            'last_reading' => $this->reading($last, $name, $sensor?->device_name), 'primary_assessment' => $assessment];
    }

    public function snapshot(User $actor, int $farmId): array
    {
        return DB::transaction(function () use ($actor, $farmId) {
            $farm = $this->farm($actor, $farmId);
            $inventory = app(PoultryHouseService::class)->listing($actor, $farmId);
            $verified = in_array($inventory['inventory_status'], ['verified', 'dummy_approved'], true);
            $installed = $inventory['available'];
            $sensors = Sensor::where('farm_id', $farmId)->orderBy('id')->get();
            $hasAssignments = Schema::hasTable('device_assignment_events');
            $events = $hasAssignments ? DB::table('device_assignment_events')->whereIn('id', $sensors->pluck('current_assignment_event_id')->filter())->get()->keyBy('id') : collect();
            $versions = $hasAssignments ? DB::table('device_assignment_events')->whereIn('sensor_id', $sensors->pluck('id'))
                ->selectRaw('sensor_id, MAX(id) as version')->groupBy('sensor_id')->pluck('version', 'sensor_id') : collect();
            $sensorsByHouse = $sensors->groupBy('poultry_house_id');
            $rows = [];
            if ($installed) {
                foreach (DB::table('poultry_houses')->where('farm_id', $farmId)->orderBy('house_number')->get() as $house) {
                    $associated = $sensorsByHouse->get($house->id, collect());
                    $eligible = $associated->where('status', 'Active');
                    $rank = ['Critical' => 7, 'Warning' => 6, 'Safe' => 5, 'Incomplete Data' => 4,
                        'No Readings Yet' => 3, 'Offline' => 2, 'Not Monitored' => 1];
                    $candidates = ($eligible->isNotEmpty() ? $eligible : collect([$associated->first()]))->map(function ($sensor) use ($house, $events, $versions, $verified) {
                        $event = $sensor ? $events->get($sensor->current_assignment_event_id) : null;

                        return $this->row($house, $sensor, $event, $verified, $sensor ? (int) $versions->get($sensor->id, 0) : 0);
                    });
                    $row = $candidates->sortByDesc(fn ($candidate) => $rank[$candidate['state']] ?? 0)->first();
                    $row['associated_devices'] = $associated->map(fn ($s) => ['id' => $s->id, 'device_name' => $s->device_name, 'status' => $s->status])->values()->all();
                    $rows[] = $row;
                }
            }
            $legacy = $sensors->filter(fn ($sensor) => ! $sensor->poultry_house_id)->map(fn ($sensor) => $this->row(null, $sensor, null, false))->values();
            $activeHouses = collect($rows)->where('house_status', 'Active');
            $monitored = $verified ? $activeHouses->where('device_status', 'Active')->where('assignment_verified', true) : collect();
            $online = $monitored->where('connectivity', 'Online')->count();
            $awaiting = $monitored->where('connectivity', 'Awaiting first reading')->count();

            return ['farm_id' => $farmId, 'farm_name' => $farm->farm_name, 'inventory_status' => $inventory['inventory_status'],
                'observed_at' => now()->toISOString(), 'rows' => array_merge($rows, $legacy->all()),
                'farm_assessment' => app(MonitoringAssessmentService::class)->farm($farm),
                'house_assessment' => app(MonitoringAssessmentService::class)->houses($rows),
                'coverage' => ['known' => $verified, 'active_houses' => $verified ? $activeHouses->count() : null,
                    'monitored_houses' => $verified ? $monitored->count() : null,
                    'unmonitored_houses' => $verified ? $activeHouses->count() - $monitored->count() : null,
                    'inactive_houses' => collect($rows)->where('house_status', 'Inactive')->count(),
                    'legacy_devices' => $legacy->count()],
                'connectivity' => ['assigned_active_house_devices' => $monitored->count(), 'online' => $online,
                    'offline' => $monitored->count() - $online - $awaiting, 'awaiting_first_reading' => $awaiting,
                    'legacy_online' => $legacy->where('connectivity', 'Online')->count()],
                'message' => ($inventory['inventory_status'] === 'dummy_approved' ? DummyHouseInventory::MESSAGE.' ' : '')
                    .($verified ? 'Conditions describe valid current primary readings. Device coverage does not prove connectivity or complete measurements.'
                    : 'House inventory is not verified. Farm-only devices and historical readings remain available as House not recorded.')];
        });
    }

    public function history(User $actor, int $farmId, array $filters): array
    {
        return DB::transaction(function () use ($actor, $farmId, $filters) {
            $this->farm($actor, $farmId);
            $context = Schema::hasColumns('sensor_readings', ['poultry_house_id', 'assignment_event_id']);
            $houseId = $filters['poultry_house_id'] ?? null;
            $period = $filters['assignment_event_id'] ?? null;
            $houses = $context && Schema::hasTable('poultry_houses')
                ? DB::table('poultry_houses')->where('farm_id', $farmId)->pluck('house_number', 'id') : collect();
            if ($houseId && $houseId !== 'unknown') {
                abort_unless($houses->has((int) $houseId), 404);
            }
            $query = SensorReading::where('farm_id', $farmId)->where('created_at', '<=', now());
            // Include devices previously at this farm, even after they have moved.
            // Only identities referenced by the authorized farm are exposed.
            $recordedDeviceIds = SensorReading::where('farm_id', $farmId)->where('created_at', '<=', now())
                ->whereNotNull('sensor_id')->distinct()->pluck('sensor_id');
            $devices = Sensor::where('farm_id', $farmId)->orWhereIn('id', $recordedDeviceIds)->get()->keyBy('id');
            $deviceIds = $recordedDeviceIds->merge($devices->keys())->unique()->sort()->values();
            if (! empty($filters['sensor_id'])) {
                if ($filters['sensor_id'] === 'unknown') {
                    $query->whereNull('sensor_id');
                } else {
                    abort_unless($deviceIds->contains((int) $filters['sensor_id']), 404);
                    $query->where('sensor_id', $filters['sensor_id']);
                }
            }
            if ($houseId) {
                if ($houseId === 'unknown') {
                    if ($context) {
                        $query->whereNull('poultry_house_id');
                    }
                } else {
                    $query->where('poultry_house_id', $houseId);
                }
            }
            if ($period) {
                if ($period === 'unknown') {
                    if ($context) {
                        $query->whereNull('assignment_event_id');
                    }
                } else {
                    abort_unless($context, 422, 'Recorded house assignment periods are unavailable.');
                    $event = DB::table('device_assignment_events')->where('id', $period)->where('to_farm_id', $farmId)->first();
                    abort_unless($event && (! $houseId || ($houseId === 'unknown' ? $event->to_house_id === null : (int) $event->to_house_id === (int) $houseId)), 404);
                    $query->where('assignment_event_id', $period);
                }
            }
            foreach (['from' => '>=', 'to' => '<='] as $name => $operator) {
                if (! empty($filters[$name])) {
                    $date = Carbon::parse($filters[$name], 'Asia/Manila');
                    $query->where('created_at', $operator, ($name === 'from' ? $date->startOfDay() : $date->endOfDay())->utc());
                }
            }
            if (! empty($filters['condition'])) {
                // Query the existing recorded primary classifications, never raw-value
                // thresholds. This mirrors MonitoringAssessmentService::reading():
                // a carried status on a NULL measurement cannot establish a condition.
                $valid = [];
                $critical = [];
                $warning = [];
                foreach (MonitoringAssessmentService::PRIMARY as $metric) {
                    $valid[$metric] = "($metric IS NOT NULL AND {$metric}_status IN ('Safe','Warning','Critical'))";
                    $critical[] = "({$valid[$metric]} AND {$metric}_status = 'Critical')";
                    $warning[] = "({$valid[$metric]} AND {$metric}_status = 'Warning')";
                }
                $condition = 'CASE WHEN '.implode(' OR ', $critical)." THEN 'Critical' WHEN "
                    .implode(' OR ', $warning)." THEN 'Warning' WHEN ".implode(' AND ', $valid)
                    ." THEN 'Safe' WHEN ".implode(' OR ', $valid)." THEN 'Incomplete Data' ELSE 'No Readings Yet' END";
                $query->whereRaw('('.$condition.') = ?', [$filters['condition']]);
            }
            $view = $filters['view'] ?? 'individual';
            if ($view === 'individual') {
                $query->orderByDesc('created_at')->orderByDesc('id');
            } else {
                // The same filtered source records power every summary. Group by
                // recorded attribution as well as Manila calendar bucket so a
                // device move can never merge two houses into one result.
                $bucket = $view === 'daily'
                    ? "DATE(CONVERT_TZ(created_at, '+00:00', '+08:00'))"
                    : "DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:00:00')";
                $severity = fn (string $metric) => "CASE WHEN SUM(CASE WHEN {$metric} IS NOT NULL AND {$metric}_status = 'Critical' THEN 1 ELSE 0 END) > 0 THEN 'Critical' WHEN SUM(CASE WHEN {$metric} IS NOT NULL AND {$metric}_status = 'Warning' THEN 1 ELSE 0 END) > 0 THEN 'Warning' WHEN SUM(CASE WHEN {$metric} IS NOT NULL AND {$metric}_status = 'Safe' THEN 1 ELSE 0 END) > 0 THEN 'Safe' ELSE NULL END";
                $query->selectRaw("MIN(id) as id, poultry_house_id, sensor_id, assignment_event_id, {$bucket} as bucket, MAX(created_at) as recorded_at, AVG(ammonia) as ammonia, AVG(moisture) as moisture, AVG(temperature) as temperature, AVG(humidity) as humidity, {$severity('ammonia')} as ammonia_status, {$severity('moisture')} as moisture_status, {$severity('temperature')} as temperature_status, {$severity('humidity')} as humidity_status, COUNT(*) as reading_count")
                    ->groupByRaw("poultry_house_id, sensor_id, assignment_event_id, {$bucket}")
                    ->orderByDesc('bucket')->orderByDesc('id');
            }
            $perPage = (int) ($filters['per_page'] ?? 10);
            $page = $query->paginate($perPage, ['*'], 'page', (int) ($filters['page'] ?? 1));
            if ($page->currentPage() > $page->lastPage()) {
                $page = $query->paginate($perPage, ['*'], 'page', $page->lastPage());
            }
            $deviceNames = Sensor::whereIn('id', $page->getCollection()->pluck('sensor_id')->filter())->get()->keyBy('id');
            $periods = $context ? DB::table('device_assignment_events')->where('to_farm_id', $farmId)
                ->when($houseId, fn ($q) => $houseId === 'unknown' ? $q->whereNull('to_house_id') : $q->where('to_house_id', $houseId))
                ->whereNotNull('to_house_id')->orderByDesc('id')->limit(100)->get(['id', 'to_house_id', 'to_house_number', 'occurred_at']) : collect();

            $items = $page->getCollection()->map(function ($reading) use ($houses, $deviceNames, $view, $farmId) {
                $name = $reading->poultry_house_id && $houses->has($reading->poultry_house_id) ? 'House '.$houses[$reading->poultry_house_id] : 'Farm-level reading';
                $device = $deviceNames->get($reading->sensor_id)?->device_name;
                if ($view === 'individual') return $this->reading($reading, $name, $device);
                $aggregate = new SensorReading();
                foreach (self::METRICS as $metric) {
                    $aggregate->{$metric} = $reading->{$metric};
                    $aggregate->{$metric.'_status'} = $reading->{$metric.'_status'};
                }
                $assessment = app(MonitoringAssessmentService::class)->reading($aggregate);
                return ['id' => (int) $reading->id, 'farm_id' => $farmId, 'sensor_id' => $reading->sensor_id,
                    'poultry_house_id' => $reading->poultry_house_id, 'assignment_event_id' => $reading->assignment_event_id,
                    'house_name' => $name, 'device_name' => $device, 'recorded_at' => Carbon::parse($reading->recorded_at)->toISOString(),
                    'bucket' => $reading->bucket, 'reading_count' => (int) $reading->reading_count, 'primary_assessment' => $assessment,
                    'ammonia' => $reading->ammonia, 'moisture' => $reading->moisture, 'temperature' => $reading->temperature, 'humidity' => $reading->humidity,
                    'ammonia_status' => $reading->ammonia_status, 'moisture_status' => $reading->moisture_status,
                    'temperature_status' => $reading->temperature_status, 'humidity_status' => $reading->humidity_status];
            });
            return ['farm_id' => $farmId, 'query_key' => $filters['query_key'] ?? null, 'view' => $view, 'items' => $items->all(),
                'total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(), 'periods' => $periods->all(),
                'devices' => $deviceIds->map(fn ($id) => ['id' => (int) $id,
                    'device_name' => $devices->get($id)?->device_name ?? 'Device '.$id.' (recorded)'])->all()];
        });
    }
}
