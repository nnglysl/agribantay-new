<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FarmSmsAlertState extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'last_reading_id' => 'integer',
        'safe_readings_count' => 'integer',
        'incident_started_at' => 'datetime',
        'resolved_at' => 'datetime',
        'last_critical_sent_at' => 'datetime',
        'last_warning_sent_at' => 'datetime',
        'last_recovery_sent_at' => 'datetime',
        'pending_started_at' => 'datetime',
        'retry_after' => 'datetime',
    ];
}
