<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PoultryHouse extends Model
{
    protected $fillable = [
        'farm_id',
        'house_name',
        'capacity',
        'status',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }

    public function sensorReadings()
    {
        return $this->hasMany(SensorReading::class);
    }

    public function sensors()
    {
        return $this->hasMany(Sensor::class);
    }
}

