<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaintenanceLog extends Model
{
    protected $fillable = [
        'farm_id',
        'maintenance_type',
        'performed_at',
        'notes',
        'photo_path',
    ];

    protected $casts = [
        'performed_at' => 'date',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }
}