<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Drops 'environmental' from the allowed values — the
        // Environmental Office now just gets a second account with
        // role = 'admin' instead of its own role. Keeps 'super_admin'.
        //
        // Safety: if any user row was actually saved with role =
        // 'environmental' before this runs, the ALTER will fail rather
        // than silently corrupt that row — reassign it first if needed:
        //   UPDATE users SET role = 'admin' WHERE role = 'environmental';
        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM('super_admin', 'admin', 'vet', 'farm_owner')
            NOT NULL
        ");
    }

    public function down(): void
    {
        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM('super_admin', 'admin', 'environmental', 'vet', 'farm_owner')
            NOT NULL
        ");
    }
};