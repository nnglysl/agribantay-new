<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaintenanceNotification extends Model
{
    protected $fillable = ['farm_id', 'event', 'anchor_date', 'sms_log_id', 'sent_at'];

    protected $casts = [
        'anchor_date' => 'date',
        'sent_at'     => 'datetime',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }

    public function smsLog()
    {
        return $this->belongsTo(SmsLog::class);
    }
}