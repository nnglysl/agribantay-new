<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ActivityLog extends Model
{
    protected $fillable = [
        'user_id',
        'role',
        'action',
        'details',
        'type',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
