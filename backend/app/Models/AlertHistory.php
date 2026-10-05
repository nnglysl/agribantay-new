<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AlertHistory extends Model
{
    protected $table = 'alert_history';

    protected $fillable = [
        'farm_id',
        'sensor_id',
        'sensor_type',
        'status',
        'value',
        'triggered_at',
        'resolved_at',
        'safe_readings_count',
    ];

    protected $casts = [
        'triggered_at' => 'datetime',
        'resolved_at' => 'datetime',
        'value' => 'float',
        'safe_readings_count' => 'integer',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }

    // Nullable: incidents recorded before per-device tracking existed, and any
    // whose unit was later deleted, have no sensor attached.
    public function sensor()
    {
        return $this->belongsTo(Sensor::class);
    }
}
