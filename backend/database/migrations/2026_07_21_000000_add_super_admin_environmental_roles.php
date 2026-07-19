<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL doesn't support adding an ENUM value directly — the column
        // has to be redefined with the full new list. Existing rows keep
        // their current values unaffected (admin/farm_owner/vet still valid).
        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM('super_admin', 'admin', 'environmental', 'vet', 'farm_owner')
            NOT NULL
        ");
    }

    public function down(): void
    {
        // Reverts to the original three roles. If any user was actually
        // created as super_admin/environmental by the time this rolls
        // back, this will fail — that's intentional (better to fail loudly
        // than silently corrupt/drop real accounts).
        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM('admin', 'farm_owner', 'vet')
            NOT NULL
        ");
    }
};