<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

/**
 * A physical IoT device. The same unit rotates between farms (2 devices,
 * 10 farms, ~1 week each), so nothing here encodes the farm:
 *
 *   - device_key  permanent technical identity burned into the firmware,
 *                 matched by SensorIngestController. Never changes.
 *   - label       permanent Admin-facing Device Name (e.g. "AGB-D01").
 *                 Entered at registration, never changes on reassignment.
 *   - sensor_code auto-generated legacy code (SFN + install date), kept as
 *                 a fallback display name for devices registered without a
 *                 label.
 *   - farm_id     the CURRENT assignment only. NULL = registered but not
 *                 assigned to any farm. Readings copy this at ingestion
 *                 time, so old readings stay with the farm they came from.
 *   - last_seen_at timestamp of the last accepted reading — drives
 *                 Online / Offline.
 */
class Sensor extends Model
{
    use HasFactory;

    protected $fillable = [
        'farm_id', 'poultry_house_id', 'device_key', 'label', 'status',
        'installed_at', 'sensor_code', 'last_seen_at',
    ];

    protected $casts = [
        'installed_at' => 'date',
        'last_seen_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Sensor $sensor) {
            // installed_at defaults to right now if not explicitly set —
            // e.g. registering a sensor that's being installed on the spot.
            if (!$sensor->installed_at) {
                $sensor->installed_at = now();
            }

            // sensor_code is generated once, here, and never touched again
            // after that — it's the sensor's permanent identifier.
            if (!$sensor->sensor_code) {
                $sensor->sensor_code = static::generateSensorCode($sensor->installed_at);
            }
        });
    }

    /**
     * Format: SFN + DDMMYY (installation date), e.g. SFN180726 for a
     * sensor installed on 18 July 2026. If another sensor was already
     * installed on that same date anywhere in the system, a letter
     * suffix (B, C, D...) is appended to keep every code unique — the
     * first sensor on any given day keeps the clean, unsuffixed format.
     */
    public static function generateSensorCode($date): string
    {
        $date = $date instanceof Carbon ? $date : Carbon::parse($date);
        $base = 'SFN' . $date->format('dmy');

        $code = $base;
        $suffix = 65; // ASCII 'A'
        while (static::where('sensor_code', $code)->exists()) {
            $code = $base . chr($suffix);
            $suffix++;
        }

        return $code;
    }

    /**
     * Admin-facing Device Name: the permanent label when one was entered,
     * otherwise the legacy auto-generated sensor_code.
     */
    public function getDeviceNameAttribute(): ?string
    {
        return $this->label ?: $this->sensor_code;
    }

    public function isActive(): bool
    {
        return $this->status === 'Active';
    }

    public function isAssigned(): bool
    {
        return $this->farm_id !== null;
    }

    /**
     * True while the last accepted reading is younger than
     * config('sensors.offline_after_minutes').
     */
    public function isOnline(): bool
    {
        if (!$this->last_seen_at) {
            return false;
        }

        return $this->last_seen_at->gt(now()->subMinutes(config('sensors.offline_after_minutes')));
    }

    /**
     * Device-level connectivity: 'Online' / 'Offline'. A device that is
     * not assigned to any farm is reported as 'Unassigned' — the farm-level
     * "Pending Setup" state lives in FarmStatusService::connectivity().
     */
    public function connectivity(): string
    {
        if (!$this->isAssigned()) {
            return 'Unassigned';
        }

        return $this->isOnline() ? 'Online' : 'Offline';
    }

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }

    public function poultryHouse()
    {
        return $this->belongsTo(PoultryHouse::class);
    }

    public function readings()
    {
        return $this->hasMany(SensorReading::class);
    }
}
