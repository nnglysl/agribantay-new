<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Farm extends Model
{
    protected $fillable = [
        'user_id',
        'farm_name',
        'owner_name',
        'mobile_number',
        'barangay',
        'municipality',
        'province',
        'address',
        'num_birds',
        'farm_size',
        'status',
        'current_status',
        'device_key',
        'latitude',
        'longitude',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function poultryHouses()
    {
        return $this->hasMany(PoultryHouse::class);
    }

    public function sensorReadings()
    {
        return $this->hasMany(SensorReading::class);
    }

    public function serviceRequests()
    {
        return $this->hasMany(ServiceRequest::class);
    }

    public function sensors()
    {
        return $this->hasMany(Sensor::class);
    }

    // Assumes Inspection has a farm_id column, following the same pattern
    // as sensorReadings() and serviceRequests() above. If Inspection is
    // linked to Farm differently (e.g. through a pivot, or a different
    // column name), this will need adjusting — I don't have that model
    // to confirm against.
    public function inspections()
    {
        return $this->hasMany(Inspection::class);
    }
}