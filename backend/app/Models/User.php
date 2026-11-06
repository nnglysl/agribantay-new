<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\PersonalAccessToken;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'first_name',
        'last_name',
        'email',
        'mobile_number',
        'address',
        'profile_photo_path',
        'password',
        'role',
        'status',
        'must_change_password',
        'legal_acknowledged_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'super_admin_slot',
    ];

    protected $casts = [
        'must_change_password' => 'boolean',
        'legal_acknowledged_at' => 'datetime',
    ];

    // Issued only after password verification, never from request-supplied
    // token metadata. Binding to the hash prevents reuse after another reset.
    public function passwordChangeTokenName(): string
    {
        return 'password_change:'.hash('sha256', $this->password);
    }

    public function hasPasswordChangeToken(): bool
    {
        $token = $this->currentAccessToken();

        return $token instanceof PersonalAccessToken
            && hash_equals($this->passwordChangeTokenName(), $token->name);
    }

    protected static function booted(): void
    {
        // Ordinary ORM mutations must not remove the system's recovery/admin
        // authority. Provisioning and database-level singleton enforcement
        // require a separately approved procedure, not a model bypass flag.
        static::updating(function (User $user) {
            if ($user->getRawOriginal('role') === 'super_admin'
                && (($user->isDirty('role') && $user->role !== 'super_admin')
                    || ($user->isDirty('status') && $user->status !== 'active'))) {
                throw ValidationException::withMessages([
                    'account' => 'The Super Admin cannot be deactivated or have its role changed.',
                ]);
            }
        });
        static::deleting(function (User $user) {
            if ($user->getRawOriginal('role') === 'super_admin') {
                throw ValidationException::withMessages([
                    'account' => 'The Super Admin account cannot be deleted.',
                ]);
            }
        });
    }

    public function getFullNameAttribute(): string
    {
        return $this->first_name.' '.$this->last_name;
    }

    /**
     * Canonical form of a PH mobile number: digits only, so "0992 772 4857",
     * "0992-772-4857" and "09927724857" all compare (and store) as the same
     * value. Every controller that accepts mobile_number must run input
     * through this BEFORE validating uniqueness, otherwise formatting
     * differences would let the same number slip past the unique check.
     */
    public static function normalizeMobileNumber(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $value);

        return $digits === '' ? null : $digits;
    }

    /**
     * Last line of defence: whatever path writes mobile_number, the stored
     * value is always normalized so the DB unique index compares like for
     * like.
     */
    public function setMobileNumberAttribute(?string $value): void
    {
        $this->attributes['mobile_number'] = self::normalizeMobileNumber($value);
    }

    public function farms()
    {
        return $this->hasMany(Farm::class);
    }

    public function uploadedControlDocuments()
    {
        return $this->hasMany(FarmControlDocument::class, 'uploaded_by');
    }
}
