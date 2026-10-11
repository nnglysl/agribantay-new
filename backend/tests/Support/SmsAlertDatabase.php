<?php

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Isolated fixtures; never migrate/reset the user's development database. */
class SmsAlertDatabase
{
    public static function create(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('mobile_number');
            $table->string('password')->nullable();
            $table->string('role')->default('farm_owner');
            $table->string('status')->default('active');
            $table->timestamps();
        });
        Schema::create('farms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained();
            foreach (['farm_name', 'owner_name', 'mobile_number', 'barangay', 'address', 'farm_size'] as $field) {
                $table->string($field)->nullable();
            }
            $table->string('status')->default('Active');
            $table->string('current_status')->default('Safe');
            $table->timestamps();
        });
        Schema::create('sensors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->nullable()->constrained();
            $table->string('device_key')->unique();
            $table->string('label')->nullable();
            $table->string('sensor_code')->nullable();
            $table->date('installed_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->string('status')->default('Active');
            $table->timestamps();
        });
        Schema::create('sensor_readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained();
            $table->foreignId('sensor_id')->nullable()->constrained();
            foreach (['ammonia', 'temperature', 'humidity', 'moisture'] as $field) {
                $table->decimal($field, 8, 2)->nullable();
                $table->string($field.'_status')->default('Safe');
            }
            $table->unsignedSmallInteger('ammonia_raw')->nullable();
            $table->unsignedSmallInteger('ammonia_adc_mv')->nullable();
            $table->unsignedSmallInteger('soil_raw')->nullable();
            $table->boolean('is_mock')->default(false);
            $table->timestamps();
        });
        Schema::create('alert_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained();
            $table->foreignId('sensor_id')->nullable()->constrained();
            $table->string('sensor_type');
            $table->string('status');
            $table->decimal('value', 8, 2);
            $table->timestamp('triggered_at');
            $table->timestamp('resolved_at')->nullable();
            $table->unsignedTinyInteger('safe_readings_count')->default(0);
            $table->timestamps();
        });
        (require database_path('migrations/2026_07_02_220121_create_sms_logs_table.php'))->up();
        (require database_path('migrations/2026_10_09_000000_create_farm_sms_alert_states_table.php'))->up();
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained();
            $table->string('title');
            $table->text('message');
            $table->string('type');
            $table->string('link')->nullable();
            $table->boolean('is_read')->default(false);
            $table->timestamps();
        });
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            foreach (['role', 'action', 'details', 'type'] as $field) {
                $table->text($field)->nullable();
            }
            $table->timestamps();
        });
        Schema::create('service_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('farm_id');
            $table->unsignedBigInteger('accepted_by')->nullable();
            $table->string('status');
        });
        Schema::create('inspections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('farm_id');
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->string('status');
        });
    }
}
