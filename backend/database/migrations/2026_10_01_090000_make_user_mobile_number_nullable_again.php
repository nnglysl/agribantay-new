<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reverses 2026_09_01_110520_make_mobile_number_required_on_users_table.
 *
 * That migration applied a farm-owner rule to every row in `users`. Farm
 * owners do always have a mobile number — it is required when a farm is
 * registered. Admin and Veterinarian accounts are not: the Register Account
 * form states "Enter at least one email or mobile number", and
 * SuperAdmin\AccountController@store has written NULL into mobile_number for
 * email-only accounts since 2026-07-28, months before the NOT NULL rule
 * landed.
 *
 * The result was that creating any Admin or Vet account by email failed with
 * SQLSTATE[23000] 1048 "Column 'mobile_number' cannot be null", which the SPA
 * surfaced only as "Server Error".
 *
 * The UNIQUE index is left exactly as it is. MySQL permits any number of NULLs
 * in a unique index, so email-only accounts do not collide with one another
 * while real numbers stay unique.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('mobile_number')->nullable()->change();
        });
    }

    /**
     * Restoring NOT NULL would fail on any email-only account created while
     * this migration was applied, so those rows are reported rather than
     * silently given a placeholder number.
     */
    public function down(): void
    {
        $emailOnly = \Illuminate\Support\Facades\DB::table('users')
            ->whereNull('mobile_number')
            ->count();

        if ($emailOnly > 0) {
            throw new RuntimeException(
                "Cannot restore NOT NULL: {$emailOnly} account(s) have no mobile number. "
                . 'Give them one (or remove them) before rolling this migration back.'
            );
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('mobile_number')->nullable(false)->change();
        });
    }
};
