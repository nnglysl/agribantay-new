<?php

namespace App\Services;

use App\Models\AlertHistory;

/**
 * Objective 5.2 — Persisted Alert History.
 *
 * This is deliberately NOT a notification system — it doesn't interrupt
 * anyone. It's a logbook: every time a sensor reading crosses into
 * Warning/Critical, a row opens. Every time it returns to Normal, that
 * same row closes (resolved_at gets set). Nothing here fires an SMS or
 * a push alert — that's the existing, separate ingestion pipeline. This
 * service only ever answers "what happened, and for how long," after
 * the fact, for the Alert History page and objective 5.1's "who's
 * currently overdue" reporting.
 *
 * One open row per (farm, sensor_type) at a time — if a Warning
 * escalates straight to Critical without ever touching Normal in
 * between, that's treated as the SAME ongoing incident (the row's
 * status/value gets updated), not two separate incidents.
 */
class AlertHistoryService
{
    /**
     * $timestamp defaults to now() for real ingestion — pass an explicit
     * historical Carbon instance when replaying old readings (see
     * AlertHistoryBackfillSeeder), so backfilled incidents get their
     * actual date instead of the moment the seeder happened to run.
     */
    public function recordReading(int $farmId, string $sensorType, string $status, float $value, ?\Carbon\Carbon $timestamp = null): void
    {
        $timestamp = $timestamp ?? now();

        $openIncident = AlertHistory::where('farm_id', $farmId)
            ->where('sensor_type', $sensorType)
            ->whereNull('resolved_at')
            ->first();

        $isAbnormal = in_array($status, ['Warning', 'Critical'], true);

        if ($isAbnormal) {
            if ($openIncident) {
                // Same ongoing incident — only touch the row if severity
                // actually changed, to avoid a write on every single
                // reading while a farm just sits at steady Critical.
                if ($openIncident->status !== $status) {
                    $openIncident->update(['status' => $status, 'value' => $value]);
                }
            } else {
                AlertHistory::create([
                    'farm_id'      => $farmId,
                    'sensor_type'  => $sensorType,
                    'status'       => $status,
                    'value'        => $value,
                    'triggered_at' => $timestamp,
                ]);
            }
        } else {
            // Back to Normal — close whatever was open, if anything was.
            if ($openIncident) {
                $openIncident->update(['resolved_at' => $timestamp]);
            }
        }
    }
}