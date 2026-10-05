<?php

namespace App\Services;

use App\Models\AlertHistory;

/**
 * Objective 5.2 — Persisted Alert History.
 *
 * This is deliberately NOT a notification system — it doesn't interrupt
 * anyone. It's a logbook: every time a sensor reading crosses into
 * Warning/Critical, a row opens. Every time it returns to Normal, that
 * same row closes (resolved_at gets set) — but only after several
 * consecutive Normal readings in a row, not a single one, so a brief
 * sensor blip doesn't prematurely mark a real incident as resolved.
 * Nothing here fires an SMS or a push alert — that's the existing,
 * separate ingestion pipeline. This service only ever answers "what
 * happened, and for how long," after the fact, for the Alert History
 * page and objective 5.1's "who's currently overdue" reporting.
 *
 * One open row per (farm, sensor_type) at a time — if a Warning
 * escalates straight to Critical without ever touching Normal in
 * between, that's treated as the SAME ongoing incident (the row's
 * status/value gets updated), not two separate incidents.
 */
class AlertHistoryService
{
    /**
     * How many consecutive Normal readings are required before an open
     * incident is actually marked resolved. Prevents a single noisy/
     * borderline reading from flipping status back and forth.
     */
    private const RESOLVE_AFTER_CONSECUTIVE_SAFE_READINGS = 3;

    /**
     * $timestamp defaults to now() for real ingestion — pass an explicit
     * historical Carbon instance when replaying old readings (see
     * AlertHistoryBackfillSeeder), so backfilled incidents get their
     * actual date instead of the moment the seeder happened to run.
     */
    public function recordReading(int $farmId, string $sensorType, string $status, float $value, ?\Carbon\Carbon $timestamp = null, ?int $sensorId = null): void
    {
        $timestamp = $timestamp ?? now();

        // Scoped to the DEVICE, not just the farm. One incident per house per
        // metric: two poultry houses both running hot are two separate
        // problems to walk to, and one of them recovering must not close the
        // other's row. $sensorId is nullable so the backfill seeder — which
        // replays readings that predate per-device tracking — still works;
        // those fall back to the old farm-wide behaviour.
        $openIncident = AlertHistory::where('farm_id', $farmId)
            ->where('sensor_type', $sensorType)
            ->when($sensorId !== null, fn($q) => $q->where('sensor_id', $sensorId))
            ->whereNull('resolved_at')
            ->first();

        // Legacy incidents opened before per-device tracking have no sensor_id,
        // so the scoped lookup above can never find them again — they would sit
        // "ongoing" forever, their duration growing indefinitely, describing a
        // farm-wide condition that per-device rows now track properly.
        //
        // Closing them here is the honest reading: the incident as recorded
        // ended when the tracking model changed. If the condition is genuinely
        // still bad, a per-device row opens for it below, so nothing is lost.
        if ($sensorId !== null) {
            AlertHistory::where('farm_id', $farmId)
                ->where('sensor_type', $sensorType)
                ->whereNull('sensor_id')
                ->whereNull('resolved_at')
                ->update(['resolved_at' => $timestamp]);
        }

        $isAbnormal = in_array($status, ['Warning', 'Critical'], true);

        if ($isAbnormal) {
            if ($openIncident) {
                // Any abnormal reading resets the safe-streak — the farm
                // never actually recovered, so the resolve countdown
                // starts over from zero next time it goes Normal.
                $updates = ['safe_readings_count' => 0];

                // Same ongoing incident — only touch status/value if
                // severity actually changed, to avoid a write on every
                // single reading while a farm just sits at steady Critical.
                if ($openIncident->status !== $status) {
                    $updates['status'] = $status;
                    $updates['value'] = $value;
                }

                $openIncident->update($updates);
            } else {
                AlertHistory::create([
                    'farm_id'              => $farmId,
                    'sensor_id'            => $sensorId,
                    'sensor_type'          => $sensorType,
                    'status'               => $status,
                    'value'                => $value,
                    'triggered_at'         => $timestamp,
                    'safe_readings_count'  => 0,
                ]);
            }
        } else {
            // Back to Normal — only close the incident once we've seen
            // enough consecutive safe readings in a row.
            if ($openIncident) {
                $safeCount = $openIncident->safe_readings_count + 1;

                if ($safeCount >= self::RESOLVE_AFTER_CONSECUTIVE_SAFE_READINGS) {
                    $openIncident->update([
                        'resolved_at'          => $timestamp,
                        'safe_readings_count'  => $safeCount,
                    ]);
                } else {
                    $openIncident->update(['safe_readings_count' => $safeCount]);
                }
            }
        }
    }

    /**
     * Resolve any still-open incident for a metric that no longer raises
     * alerts.
     *
     * When a metric is dropped from config('sensors.alerting_metrics'),
     * recordReading() stops being called for it - and an incident it had
     * already opened would stay "ongoing" for good, because the only thing
     * that ever closes one is a later safe reading of that same metric. The
     * row is closed rather than deleted: it really did happen, and the
     * farm's history should still show it.
     */
    public function closeOpenIncidents(int $farmId, string $sensorType, ?int $sensorId = null, ?\Carbon\Carbon $timestamp = null): void
    {
        AlertHistory::where('farm_id', $farmId)
            ->where('sensor_type', $sensorType)
            ->whereNull('resolved_at')
            ->when($sensorId !== null, fn ($q) => $q->where(
                fn ($w) => $w->where('sensor_id', $sensorId)->orWhereNull('sensor_id')
            ))
            ->update(['resolved_at' => $timestamp ?? now()]);
    }
}
