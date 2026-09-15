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
        'lot_number',
        'street',
        'landmark',
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

    public function inspections()
    {
        return $this->hasMany(Inspection::class);
    }

    public function maintenanceLogs()
    {
        return $this->hasMany(MaintenanceLog::class);
    }

    public function recommendations()
    {
        return $this->hasMany(Recommendation::class);
    }

    public function aiRecommendations()
    {
        return $this->hasMany(AiRecommendation::class);
    }

    public function alertHistory()
    {
        return $this->hasMany(AlertHistory::class);
    }

    public function manureDisposalRecords()
    {
        return $this->hasMany(ManureDisposalRecord::class);
    }
}