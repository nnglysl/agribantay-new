<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE farms MODIFY COLUMN farm_size ENUM('Small', 'Medium', 'Large') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE farms MODIFY COLUMN farm_size ENUM('Small', 'Semi-Commercial', 'Commercial') NOT NULL");
    }
};