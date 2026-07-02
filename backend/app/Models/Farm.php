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
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function poultryHouses()
    {
        return $this->hasMany(PoultryHouse::class);
    }

    public function sensorReading()
    {
        return $this->hasMany(SensorReading::class);
    }

    public function serviceRequests()
    {
        return $this->hasMany(ServiceRequest::class);
    }

    public function inspections()
    {
        return $this->hasMany(Inspection::class);
    }
}