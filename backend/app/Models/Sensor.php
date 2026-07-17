<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Sensor extends Model
{
    use HasFactory;

    protected $fillable = [
        'farm_id', 'poultry_house_id', 'device_key', 'label', 'status',
    ];

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