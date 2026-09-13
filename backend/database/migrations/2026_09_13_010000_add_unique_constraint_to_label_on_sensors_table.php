<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Device Name (label) is now system-generated and must be unique —
        // same guarantee sensor_code already has. MySQL allows multiple NULLs
        // under a unique index, so the one pre-existing sensor with a null
        // label (predating this feature) is unaffected.
        Schema::table('sensors', function (Blueprint $table) {
            $table->unique('label');
        });
    }

    public function down(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            $table->dropUnique(['label']);
        });
    }
};
