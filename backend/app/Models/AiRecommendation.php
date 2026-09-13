<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiRecommendation extends Model
{
    protected $fillable = [
        'farm_id',
        'explanation_en',
        'explanation_fil',
        'main_action_fil',
        'tips_fil',
        'generated_date',
        'force_refresh',
    ];

    protected $casts = [
        'tips_fil'       => 'array',
        'generated_date' => 'date',
        'force_refresh'  => 'boolean',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }
}