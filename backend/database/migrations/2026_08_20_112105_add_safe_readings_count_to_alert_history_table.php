<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('alert_history', function (Blueprint $table) {
            $table->unsignedInteger('safe_readings_count')->default(0)->after('resolved_at');
        });
    }

    public function down(): void
    {
        Schema::table('alert_history', function (Blueprint $table) {
            $table->dropColumn('safe_readings_count');
        });
    }
};