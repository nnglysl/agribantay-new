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
}