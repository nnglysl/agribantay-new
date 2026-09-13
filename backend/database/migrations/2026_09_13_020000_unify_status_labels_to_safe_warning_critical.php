<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Unifies every environmental-condition status label in the system to the
 * same three words — Safe / Warning / Critical — replacing the two other
 * vocabularies that existed for the same 3-tier concept:
 *   - sensor_readings.*_status: 'Normal' -> 'Safe' (Warning/Critical unchanged)
 *   - farms.current_status:     'Moderate' -> 'Warning' (Safe/Critical unchanged)
 *
 * This is a LABEL-ONLY change — the thresholds/logic that decide which tier
 * a reading falls into (SensorIngestController::status()) and which tier a
 * farm aggregates to (FarmStatusService::computeStatus()) are untouched.
 *
 * Three-step dance required because these are strict MySQL enum columns:
 * widen the enum to accept BOTH old and new labels, rewrite the data, then
 * narrow the enum to only the new labels. Doing the data rewrite before
 * widening truncates every row to '' (enum members not yet in the allowed
 * list get silently blanked, or rejected outright under strict mode).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE sensor_readings MODIFY ammonia_status ENUM('Normal','Safe','Warning','Critical') NOT NULL DEFAULT 'Normal'");
        DB::statement("ALTER TABLE sensor_readings MODIFY temperature_status ENUM('Normal','Safe','Warning','Critical') NOT NULL DEFAULT 'Normal'");
        DB::statement("ALTER TABLE sensor_readings MODIFY humidity_status ENUM('Normal','Safe','Warning','Critical') NOT NULL DEFAULT 'Normal'");
        DB::statement("ALTER TABLE sensor_readings MODIFY moisture_status ENUM('Normal','Safe','Warning','Critical') NOT NULL DEFAULT 'Normal'");
        DB::statement("ALTER TABLE farms MODIFY current_status ENUM('Safe','Moderate','Warning','Critical') NOT NULL DEFAULT 'Safe'");

        DB::table('sensor_readings')->where('ammonia_status', 'Normal')->update(['ammonia_status' => 'Safe']);
        DB::table('sensor_readings')->where('temperature_status', 'Normal')->update(['temperature_status' => 'Safe']);
        DB::table('sensor_readings')->where('humidity_status', 'Normal')->update(['humidity_status' => 'Safe']);
        DB::table('sensor_readings')->where('moisture_status', 'Normal')->update(['moisture_status' => 'Safe']);
        DB::table('farms')->where('current_status', 'Moderate')->update(['current_status' => 'Warning']);

        DB::statement("ALTER TABLE sensor_readings MODIFY ammonia_status ENUM('Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
        DB::statement("ALTER TABLE sensor_readings MODIFY temperature_status ENUM('Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
        DB::statement("ALTER TABLE sensor_readings MODIFY humidity_status ENUM('Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
        DB::statement("ALTER TABLE sensor_readings MODIFY moisture_status ENUM('Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
        DB::statement("ALTER TABLE farms MODIFY current_status ENUM('Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE sensor_readings MODIFY ammonia_status ENUM('Normal','Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
        DB::statement("ALTER TABLE sensor_readings MODIFY temperature_status ENUM('Normal','Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
        DB::statement("ALTER TABLE sensor_readings MODIFY humidity_status ENUM('Normal','Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
        DB::statement("ALTER TABLE sensor_readings MODIFY moisture_status ENUM('Normal','Safe','Warning','Critical') NOT NULL DEFAULT 'Safe'");
        DB::statement("ALTER TABLE farms MODIFY current_status ENUM('Safe','Moderate','Warning','Critical') NOT NULL DEFAULT 'Safe'");

        DB::table('sensor_readings')->where('ammonia_status', 'Safe')->update(['ammonia_status' => 'Normal']);
        DB::table('sensor_readings')->where('temperature_status', 'Safe')->update(['temperature_status' => 'Normal']);
        DB::table('sensor_readings')->where('humidity_status', 'Safe')->update(['humidity_status' => 'Normal']);
        DB::table('sensor_readings')->where('moisture_status', 'Safe')->update(['moisture_status' => 'Normal']);
        DB::table('farms')->where('current_status', 'Warning')->update(['current_status' => 'Moderate']);

        DB::statement("ALTER TABLE sensor_readings MODIFY ammonia_status ENUM('Normal','Warning','Critical') NOT NULL DEFAULT 'Normal'");
        DB::statement("ALTER TABLE sensor_readings MODIFY temperature_status ENUM('Normal','Warning','Critical') NOT NULL DEFAULT 'Normal'");
        DB::statement("ALTER TABLE sensor_readings MODIFY humidity_status ENUM('Normal','Warning','Critical') NOT NULL DEFAULT 'Normal'");
        DB::statement("ALTER TABLE sensor_readings MODIFY moisture_status ENUM('Normal','Warning','Critical') NOT NULL DEFAULT 'Normal'");
        DB::statement("ALTER TABLE farms MODIFY current_status ENUM('Safe','Moderate','Critical') NOT NULL DEFAULT 'Safe'");
    }
};
