<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SensorReading extends Model
{
    protected $fillable = [
        'farm_id',
        'poultry_house_id',
        'ammonia',
        'temperature',
        'humidity',
        'moisture',
        'ammonia_status',
        'temperature_status',
        'humidity_status',
        'moisture_status',
        'is_mock',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }

    public function poultryHouse()
    {
        return $this->belongsTo(PoultryHouse::class);
    }
}