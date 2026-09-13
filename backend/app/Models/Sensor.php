<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

class Sensor extends Model
{
    use HasFactory;

    protected $fillable = [
        'farm_id', 'poultry_house_id', 'device_key', 'label', 'status',
        'installed_at', 'sensor_code',
    ];

    protected $casts = [
        'installed_at' => 'date',
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

            // label ("Device Name") is always system-generated, never
            // Admin-entered — see generateDeviceName() below. Any caller-
            // supplied value is intentionally overwritten so there is no
            // path to a manually-typed or duplicate Device Name.
            $sensor->label = static::generateDeviceName($sensor->farm_id, $sensor->installed_at);
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
     * Format: SFN + farm_id (zero-padded to at least 2 digits) + DDMMYY
     * (installation date), e.g. SFN01210726 for farm #1's device installed
     * on 21 July 2026. Unlike generateSensorCode() above, the farm id makes
     * this unique across farms even when several farms install a device on
     * the exact same date — a plain date-only code would collide there. A
     * letter suffix (B, C, D...) still covers the remaining edge case of
     * the *same* farm registering more than one device on the same day.
     */
    public static function generateDeviceName(int $farmId, $date): string
    {
        $date = $date instanceof Carbon ? $date : Carbon::parse($date);
        $base = 'SFN' . str_pad((string) $farmId, 2, '0', STR_PAD_LEFT) . $date->format('dmy');

        $name = $base;
        $suffix = 65; // ASCII 'A'
        while (static::where('label', $name)->exists()) {
            $name = $base . chr($suffix);
            $suffix++;
        }

        return $name;
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