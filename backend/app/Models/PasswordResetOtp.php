<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PasswordResetOtp extends Model
{
    protected $fillable = [
        'user_id',
        'channel',
        'code_hash',
        'expires_at',
        'verified_at',
        'reset_token',
        'reset_token_expires_at',
        'consumed_at',
    ];

    protected $casts = [
        'expires_at'             => 'datetime',
        'verified_at'            => 'datetime',
        'reset_token_expires_at' => 'datetime',
        'consumed_at'            => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}