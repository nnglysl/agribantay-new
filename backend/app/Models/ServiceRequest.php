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
        'completion_notes',
        'status',
        'priority',
        'scheduled_at',
        'previous_scheduled_at',
        'reschedule_reason',
        'decline_reason',
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

    /**
     * The accomplished form(s) attached on completion, oldest first — up to
     * Vet\VaccinationRequestController::ATTACHMENT_MAX_FILES per request.
     */
    public function attachments()
    {
        return $this->hasMany(ServiceRequestAttachment::class)->orderBy('id');
    }

    /**
     * Most recent attachment. Kept for callers written against the
     * one-file version; new code reads attachments().
     */
    public function attachment()
    {
        return $this->hasOne(ServiceRequestAttachment::class)->latestOfMany();
    }
}
