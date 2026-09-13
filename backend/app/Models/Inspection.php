<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Inspection extends Model
{
    protected $fillable = [
        'inspection_number',
        'farm_id',
        'assigned_to',
        'scheduled_by',
        'inspection_type',
        'notes',
        'findings',
        'status',
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

    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function scheduledBy()
    {
        return $this->belongsTo(User::class, 'scheduled_by');
    }
}