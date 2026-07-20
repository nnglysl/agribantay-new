<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AlertHistory extends Model
{
    protected $table = 'alert_history';

    protected $fillable = [
        'farm_id',
        'sensor_type',
        'status',
        'value',
        'triggered_at',
        'resolved_at',
    ];

    protected $casts = [
        'triggered_at' => 'datetime',
        'resolved_at'  => 'datetime',
        'value'        => 'float',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }
}