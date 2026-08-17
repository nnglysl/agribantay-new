<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('alert_history', function (Blueprint $table) {
            // Counts consecutive Normal readings received while this
            // incident is still open. Reset to 0 the moment an abnormal
            // reading comes back in — only a genuinely sustained return
            // to Normal should close the incident (see
            // AlertHistoryService::RESOLVE_AFTER_CONSECUTIVE_SAFE_READINGS).
            $table->unsignedTinyInteger('safe_readings_count')->default(0)->after('value');
        });
    }

    public function down(): void
    {
        Schema::table('alert_history', function (Blueprint $table) {
            $table->dropColumn('safe_readings_count');
        });
    }
};