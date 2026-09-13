<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceRequest extends Model
{
    protected $fillable = [
        'request_number',
        'farm_id',
        'requested_by',
        'accepted_by',
        'service_type',
        'notes',
        'status',
        'priority',
        'scheduled_at',
        'previous_scheduled_at',
        'reschedule_reason',
        'completed_at',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'previous_scheduled_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function acceptedBy()
    {
        return $this->belongsTo(User::class, 'accepted_by');
    }
}