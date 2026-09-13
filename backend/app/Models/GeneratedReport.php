<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GeneratedReport extends Model
{
    protected $fillable = [
        'report_name',
        'period_start',
        'period_end',
        'report_type',
        'generated_by_id',
        'snapshot',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end'   => 'date',
        'snapshot'     => 'array',
    ];

    public function generatedBy()
    {
        return $this->belongsTo(User::class, 'generated_by_id');
    }
}
