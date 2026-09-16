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

    // farms.mobile_number is a copy of the owner's contact number, so it is
    // kept in the same canonical digits-only form as users.mobile_number.
    public function setMobileNumberAttribute(?string $value): void
    {
        $this->attributes['mobile_number'] = User::normalizeMobileNumber($value);
    }

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

    /**
     * The farm's newest reading as a one-to-one, so list endpoints can
     * eager-load it in a single query instead of FarmStatusService running
     * one `latest()->first()` per farm (see FarmStatusService::syncStatus).
     */
    public function latestReading()
    {
        return $this->hasOne(SensorReading::class)->latestOfMany();
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

    /**
     * Most recent Full Manure Clean-out — the anchor MaintenanceStatusService
     * measures compliance from. Eager-loadable for the same reason as
     * latestReading(): one query for every farm instead of one per farm.
     */
    public function latestCleanout()
    {
        return $this->hasOne(MaintenanceLog::class)->ofMany(
            ['performed_at' => 'max', 'id' => 'max'],
            fn ($q) => $q->where('maintenance_type', 'Full Manure Clean-out')
        );
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