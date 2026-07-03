<?php

namespace App\Services;

use App\Models\Farm;
use App\Models\SensorReading;

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
            return 'Moderate';
        }

        return 'Safe';
    }

   private function notify(Farm $farm, string $status): void
{
    $action = match ($status) {
        'Critical' => 'Recommended: check farm ventilation and equipment soon.',
        'Moderate' => 'Recommended: monitor ventilation and litter conditions.',
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
        'action'  => $status === 'Critical' ? 'Critical alert triggered' : ($status === 'Safe' ? 'Status recovered' : 'Moderate alert triggered'),
        'details' => "{$farm->farm_name} — {$status}",
        'type'    => 'Alert',
    ]);
}
}