<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SensorReading extends Model
{
    protected $fillable = [
        'farm_id',
        'sensor_id',
        'ammonia',
        'temperature',
        'humidity',
        'moisture',
        'ammonia_status',
        'temperature_status',
        'humidity_status',
        'moisture_status',
        'is_mock',

        // The MQ-137's raw ADC count, kept beside the ppm derived from it so
        // a later recalibration can be applied to history. See the migration
        // 2026_10_05_200000_add_ammonia_raw_to_sensor_readings_table.
        'ammonia_raw',
        // Separate ESP32 calibrated ADC voltage sample, in millivolts (not ppm).
        'ammonia_adc_mv',

        // The capacitive probe's raw ADC count, for the same reason. Moisture
        // needs it more: unlike the old placeholder ammonia scale, neither
        // the two-point nor the polynomial moisture conversion can be
        // inverted without the per-device constants that were in force when
        // the row was written. See the migration
        // 2026_10_05_210000_add_soil_raw_to_sensor_readings_table.
        'soil_raw',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }

    public function sensor()
    {
        return $this->belongsTo(Sensor::class);
    }
}
