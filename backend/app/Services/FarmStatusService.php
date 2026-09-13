<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\Inspection;
use App\Models\Notification;
use App\Models\User;

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
        $latest = SensorReading::where('farm_id', $farm->id)->latest()->first();

        if (!$latest) {
            return;
        }

        $newStatus = $this->computeStatus($latest);

        if ($newStatus === $farm->current_status) {
            return; // no change — prevent duplicate SMS
        }

        $farm->update(['current_status' => $newStatus]);

        $this->notify($farm, $newStatus);

        if ($newStatus === 'Critical') {
            $this->notifyAdminsOfCritical($farm);
            $this->notifyVetsOfCritical($farm);
            app(RecommendationExplanationService::class)->markForRefresh($farm->id);
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
                'is_read' => false,
            ]);
        }
    }

    private function computeStatus(SensorReading $reading): string
    {
        $statuses = [
            $reading->ammonia_status,
            $reading->temperature_status,
            $reading->humidity_status,
            $reading->moisture_status,
        ];

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

        $detectedAt = now()->format('M d, Y g:i A');

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
                'is_read' => false,
            ]);
        }
    }
}