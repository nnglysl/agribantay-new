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