<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Alert history is per device/metric. SMS episodes and delivery clocks
        // are per farm, so they cannot safely live on one alert_history row.
        Schema::create('farm_sms_alert_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('last_reading_id')->nullable();
            $table->string('observed_status')->nullable();
            $table->string('last_abnormal_status')->nullable();
            $table->uuid('incident_token')->nullable();
            $table->timestamp('incident_started_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->unsignedTinyInteger('safe_readings_count')->default(0);
            $table->timestamp('last_critical_sent_at')->nullable();
            $table->timestamp('last_warning_sent_at')->nullable();
            $table->timestamp('last_recovery_sent_at')->nullable();
            $table->uuid('pending_token')->nullable();
            $table->uuid('pending_incident_token')->nullable();
            $table->string('pending_status')->nullable();
            $table->string('pending_outcome')->nullable();
            $table->timestamp('pending_started_at')->nullable();
            $table->timestamp('retry_after')->nullable();
            $table->timestamps();
        });

        Schema::table('sms_logs', function (Blueprint $table) {
            $table->uuid('sms_alert_token')->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('sms_logs', function (Blueprint $table) {
            $table->dropUnique(['sms_alert_token']);
            $table->dropColumn('sms_alert_token');
        });
        Schema::dropIfExists('farm_sms_alert_states');
    }
};
