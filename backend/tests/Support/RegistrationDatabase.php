<?php

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Extend fresh private fixtures only; never run on an operational connection. */
class RegistrationDatabase
{
    public static function fields(): void
    {
        Schema::table('users', function (Blueprint $t) {
            foreach (['address', 'profile_photo_path'] as $field) {
                if (! Schema::hasColumn('users', $field)) {
                    $t->string($field)->nullable();
                }
            }
            if (! Schema::hasColumn('users', 'must_change_password')) {
                $t->boolean('must_change_password')->default(false);
            }
        });
        Schema::table('farms', function (Blueprint $t) {
            foreach (['lot_number', 'street', 'landmark', 'municipality', 'province'] as $field) {
                if (! Schema::hasColumn('farms', $field)) {
                    $t->string($field)->nullable();
                }
            }
            if (! Schema::hasColumn('farms', 'latitude')) {
                $t->double('latitude')->nullable();
            }
            if (! Schema::hasColumn('farms', 'longitude')) {
                $t->double('longitude')->nullable();
            }
        });
    }
}
