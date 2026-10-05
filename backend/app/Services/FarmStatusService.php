<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\SensorReading;
use App\Models\Sensor;
use App\Models\ServiceRequest;
use App\Models\Inspection;
use App\Models\Notification;
use App\Models\User;
use App\Support\LocalTime;

class FarmStatusService
{
    protected SmsService $sms;

    public function __construct(SmsService $sms)
    {
        $this->sms = $sms;
    }

    /**
     * Check a farm's latest sensor reading, and if the derived status
     * has changed since last recorded, update it and send an SMS alert.
     */
    public function syncStatus(Farm $farm): void
    {
        $newStatus = $this->farmStatus($farm);

        if ($newStatus === null) {
            return;
        }

        if ($newStatus === $farm->current_status) {
            return; // no change — prevent duplicate SMS
        }

        $farm->update(['current_status' => $newStatus]);

        $this->notify($farm, $newStatus);

        // The stored explanation describes the farm's CONDITION, so it is
        // wrong the moment that condition changes — not only when it worsens.
        // This used to fire on entry to Critical alone, which left a farm
        // that had recovered still reading its Critical explanation, and a
        // farm that had drifted Safe -> Warning still reading "conditions are
        // normal", until the next calendar day rolled over.
        //
        // Reaching this line already means the status genuinely changed
        // (identical statuses returned above), so this cannot fire on every
        // reading while a farm simply sits at one level.
        app(RecommendationExplanationService::class)->markForRefresh($farm->id);

        if ($newStatus === 'Critical') {
            $this->notifyAdminsOfCritical($farm);
            $this->notifyVetsOfCritical($farm);
        }
    }

    /**
     * Critical sensor reading -> notify LGU/Admin so THEY can manually
     * schedule an inspection via the existing Inspection form. Deliberately
     * does NOT auto-create an Inspection row — InspectionController enforces
     * one inspection system-wide per day, and picking a date/farm priority
     * on the system's behalf isn't a decision this service should make.
     * Naturally rate-limited: syncStatus() only calls this when current_status
     * actually just changed to Critical, not on every reading while it stays
     * Critical.
     */
    private function notifyAdminsOfCritical(Farm $farm): void
    {
        $admins = User::whereIn('role', ['admin', 'super_admin'])
            ->where('status', 'active')
            ->get();

        foreach ($admins as $admin) {
            Notification::create([
                'user_id' => $admin->id,
                'title'   => 'Critical Condition Detected',
                'message' => "Critical condition detected at \"{$farm->farm_name}\" ({$farm->owner_name}). Please review and schedule an inspection.",
                'type'    => 'Sensor Alert',
                'link'    => "/admin/farms/{$farm->id}",
                'is_read' => false,
            ]);
        }
    }

    /**
     * Only vets already involved with this specific farm — an accepted
     * (Pending/Scheduled) service request or a Scheduled inspection — get
     * notified of a Critical reading there. A system-wide broadcast to
     * every vet for every farm's alert would bury the ones actually
     * relevant to a vet's own assigned patients.
     */
    private function notifyVetsOfCritical(Farm $farm): void
    {
        $vetIds = ServiceRequest::where('farm_id', $farm->id)
            ->whereIn('status', ['Pending', 'Scheduled'])
            ->whereNotNull('accepted_by')
            ->pluck('accepted_by')
            ->merge(
                Inspection::where('farm_id', $farm->id)
                    ->where('status', 'Scheduled')
                    ->whereNotNull('assigned_to')
                    ->pluck('assigned_to')
            )
            ->unique();

        if ($vetIds->isEmpty()) {
            return;
        }

        $vets = User::whereIn('id', $vetIds)
            ->where('role', 'vet')
            ->where('status', 'active')
            ->get();

        foreach ($vets as $vet) {
            Notification::create([
                'user_id' => $vet->id,
                'title'   => 'Critical Farm Alert',
                'message' => "\"{$farm->farm_name}\" has a Critical ammonia level that may require veterinary attention.",
                'type'    => 'Sensor Alert',
                'link'    => "/vet/farms/{$farm->id}",
                'is_read' => false,
            ]);
        }
    }

    /**
     * True when the farm has at least one Sensor row currently marked
     * Active — i.e. a device is actually registered and turned on for
     * this farm right now (a device that was registered then deactivated
     * via SensorController::update() does not count).
     */
    public function hasActiveDevice(Farm $farm): bool
    {
        return $farm->relationLoaded('sensors')
            ? $farm->sensors->contains(fn($s) => $s->status === 'Active')
            : $farm->sensors()->where('status', 'Active')->exists();
    }

    /**
     * The status actually shown to users. farms.current_status defaults to
     * "Safe" in the database and is only ever updated by syncStatus() above
     * when a real sensor reading comes in — so a brand-new farm with no
     * device yet, or a device that hasn't sent its first reading yet, was
     * previously indistinguishable from a genuinely healthy farm. This
     * overrides that default with "Pending Setup" in both of those cases.
     * Never touches current_status itself or how Safe/Warning/Critical are
     * computed from real readings (computeStatus() above is unchanged).
     */
    public function displayStatus(Farm $farm): string
    {
        if (!$this->hasActiveDevice($farm)) {
            return 'Pending Setup';
        }

        $hasReading = $farm->relationLoaded('sensorReadings')
            ? $farm->sensorReadings->isNotEmpty()
            : $farm->sensorReadings()->exists();

        if (!$hasReading) {
            return 'Pending Setup';
        }

        return $farm->current_status;
    }

    /**
     * Farm-level device connectivity, independent of the Safe/Warning/
     * Critical condition status:
     *
     *   Pending Setup — no Active device is currently assigned to the farm
     *                   (e.g. the device was unassigned/moved and nothing
     *                   has replaced it yet).
     *   Online        — an assigned Active device sent an accepted reading
     *                   within config('sensors.offline_after_minutes').
     *   Offline       — a device is still assigned but has gone quiet
     *                   (unplugged, no LTE signal, moved without Admin
     *                   unassigning it, or never sent anything yet).
     *
     * Computed on read from sensors.last_seen_at — no scheduler needed.
     */
    public function connectivity(Farm $farm): string
    {
        $active = $this->activeSensors($farm);

        if ($active->isEmpty()) {
            return 'Pending Setup';
        }

        return $active->contains(fn($s) => $s->isOnline()) ? 'Online' : 'Offline';
    }

    /**
     * Most recent accepted reading across the farm's currently assigned
     * Active devices — the "Last Synchronization" shown next to
     * connectivity(). Null while Pending Setup or before the first reading.
     */
    public function lastSeenAt(Farm $farm): ?\Carbon\Carbon
    {
        return $this->activeSensors($farm)
            ->filter(fn($s) => $s->last_seen_at)
            ->max('last_seen_at');
    }

    private function activeSensors(Farm $farm)
    {
        $sensors = $farm->relationLoaded('sensors')
            ? $farm->sensors
            : $farm->sensors()->get();

        return $sensors->filter(fn($s) => $s->status === 'Active');
    }

    /**
     * Farm counts bucketed by displayStatus() — the single source of truth
     * for every "Safe / Warning / Critical" farm-count breakdown shown in
     * Reports/Overview and the archived monthly report, so a farm without
     * a device is correctly excluded from "Safe" there too.
     */
    public function statusBreakdown(): array
    {
        $farms = Farm::with(['sensors', 'sensorReadings' => function ($q) {
            $q->latest()->limit(1);
        }])->get();

        $breakdown = ['normal' => 0, 'warning' => 0, 'critical' => 0, 'pending_setup' => 0];

        foreach ($farms as $farm) {
            match ($this->displayStatus($farm)) {
                'Safe' => $breakdown['normal']++,
                'Warning' => $breakdown['warning']++,
                'Critical' => $breakdown['critical']++,
                default => $breakdown['pending_setup']++,
            };
        }

        return $breakdown;
    }

    /**
     * The farm is as bad as its WORST house — the same "worst wins" rule the
     * dashboard, the reading truth table and the alert history all use.
     *
     * This used to read the single newest row in sensor_readings, which was
     * correct only while a farm had one device. With two houses reporting a
     * minute apart, the farm's status followed whichever unit happened to
     * report last: house A (Warning) → Warning, house B (Critical) →
     * Critical, house A again → Warning. Every one of those flips counted as
     * a change, so the owner was texted Warning/Critical/Warning/Critical
     * every couple of minutes while nothing at the farm had actually
     * changed. Taking the worst across all active devices makes the status
     * stable: it only moves when the farm genuinely gets better or worse.
     *
     * Returns null when the farm has no readings at all, so the caller can
     * leave current_status alone rather than forcing it to Safe.
     */
    private function farmStatus(Farm $farm): ?string
    {
        $latestPerDevice = Sensor::where('farm_id', $farm->id)
            ->where('status', 'Active')
            ->get()
            // id DESC as the tiebreaker: two readings can land in the same
            // second, and created_at alone then picks between them
            // arbitrarily — which made the farm's status depend on row order
            // rather than on the actual newest reading.
            ->map(fn(Sensor $sensor) => SensorReading::where('sensor_id', $sensor->id)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->first())
            ->filter();

        // No active device has ever reported — or the farm's readings predate
        // per-device tracking, in which case fall back to the newest row.
        if ($latestPerDevice->isEmpty()) {
            $fallback = SensorReading::where('farm_id', $farm->id)->latest()->first();
            return $fallback ? $this->computeStatus($fallback) : null;
        }

        $rank = ['Safe' => 0, 'Warning' => 1, 'Critical' => 2];

        return $latestPerDevice
            ->map(fn(SensorReading $r) => $this->computeStatus($r))
            ->sortByDesc(fn(string $status) => $rank[$status] ?? 0)
            ->first();
    }

    /**
     * A reading's severity, from the alerting metrics only.
     *
     * Temperature, humidity and manure moisture are still measured and shown,
     * but they are conditions that drive ammonia rather than hazards in their
     * own right, and their published thresholds come from other climates.
     * config('sensors.alerting_metrics') is the single place that decides
     * which ones count - see that file for the reasoning.
     */
    public function computeStatus(SensorReading $reading): string
    {
        $statuses = collect(config('sensors.alerting_metrics', ['ammonia']))
            ->map(fn (string $metric) => $reading->{$metric . '_status'})
            ->filter()
            ->all();

        if (in_array('Critical', $statuses)) {
            return 'Critical';
        }

        if (in_array('Warning', $statuses)) {
            return 'Warning';
        }

        return 'Safe';
    }

    private function notify(Farm $farm, string $status): void
    {
        $action = match ($status) {
            'Critical' => 'Recommended: check farm ventilation and equipment soon.',
            'Warning'  => 'Recommended: monitor ventilation and litter conditions.',
            'Safe'     => 'Farm conditions are back to normal levels.',
            default    => '',
        };

        $detectedAt = LocalTime::dateTime(now());

        $message = "AgriBantay Update: {$farm->farm_name} is now at {$status} level as of {$detectedAt}. {$action}";

        $this->sms->send(
            $farm->mobile_number,
            $message,
            'Farm Status',
            $farm->user_id,
            $farm->id
        );

        \App\Models\ActivityLog::create([
            'user_id' => null,
            'role'    => 'System',
            'action'  => $status === 'Critical' ? 'Critical alert triggered' : ($status === 'Safe' ? 'Status recovered' : 'Warning alert triggered'),
            'details' => "{$farm->farm_name} — {$status}",
            'type'    => 'Alert',
        ]);

        // The farmer already gets the SMS above — this is the in-app
        // counterpart, shown in their own Notifications panel. Fires on the
        // same state transitions as the SMS (never on every reading), so a
        // farm stuck at Critical across repeated readings doesn't spam this
        // either.
        if ($farm->user_id) {
            $title = match ($status) {
                'Critical' => 'Critical Farm Alert',
                'Warning'  => 'Farm Condition Warning',
                'Safe'     => 'Farm Condition Normalized',
                default    => 'Farm Status Update',
            };

            Notification::create([
                'user_id' => $farm->user_id,
                'title'   => $title,
                'message' => $message,
                'type'    => 'Sensor Alert',
                'link'    => '/farmowner/dashboard',
                'is_read' => false,
            ]);
        }
    }
}