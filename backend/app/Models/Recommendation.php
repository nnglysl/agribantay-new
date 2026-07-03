<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Recommendation extends Model
{
    protected $fillable = [
        'farm_id',
        'type',
        'priority',
        'root_cause',
        'preventive_action',
        'suggested_next_step',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }
}