<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ManureDisposalRecord extends Model
{
    protected $table = 'manure_disposal_records';

    protected $fillable = [
        'farm_id',
        'disposal_method',
        'quantity',
        'buyer_name',
        'disposal_date',
        'notes',
    ];

    protected $casts = [
        'disposal_date' => 'date',
        'quantity'      => 'float',
    ];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }
}