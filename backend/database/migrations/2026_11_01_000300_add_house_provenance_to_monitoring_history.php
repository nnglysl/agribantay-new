<?php

use Database\Support\PoultryHouseSchema;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require_once __DIR__.'/../support/PoultryHouseSchema.php';

return new class extends Migration
{
    public function up(): void
    {
        PoultryHouseSchema::requireBaseline();
        if (! Schema::hasColumn('sensors', 'active_house_slot')) {
            throw new RuntimeException('Install the reviewed current house-assignment foundation first.');
        }
        foreach (['sensor_readings', 'alert_history'] as $table) {
            PoultryHouseSchema::absentColumns($table, ['poultry_house_id', 'assignment_event_id']);
        }
        PoultryHouseSchema::absentColumns('sensor_readings', ['measurement_context']);
        foreach (['sensor_readings' => 'sr', 'alert_history' => 'ah'] as $name => $prefix) {
            Schema::table($name, function (Blueprint $table) use ($prefix) {
                $table->unsignedBigInteger('poultry_house_id')->nullable();
                $table->unsignedBigInteger('assignment_event_id')->nullable();
                $table->foreign(['farm_id', 'poultry_house_id'], $prefix.'_house_membership_fk')
                    ->references(['farm_id', 'id'])->on('poultry_houses')->restrictOnDelete()->restrictOnUpdate();
                $table->foreign(['assignment_event_id', 'farm_id', 'poultry_house_id'], $prefix.'_assignment_house_fk')
                    ->references(['id', 'to_farm_id', 'to_house_id'])->on('device_assignment_events')
                    ->restrictOnDelete()->restrictOnUpdate();
                $table->foreign(['assignment_event_id', 'sensor_id', 'farm_id', 'poultry_house_id'], $prefix.'_assignment_device_fk')
                    ->references(['id', 'sensor_id', 'to_farm_id', 'to_house_id'])->on('device_assignment_events')
                    ->restrictOnDelete()->restrictOnUpdate();
            });
            DB::statement('ALTER TABLE '.$name.' ADD CONSTRAINT '.$prefix.'_house_context_ck CHECK (
                (poultry_house_id IS NULL AND assignment_event_id IS NULL)
                OR (poultry_house_id IS NOT NULL AND assignment_event_id IS NOT NULL))');
        }
        Schema::table('sensor_readings', function (Blueprint $table) {
            $table->json('measurement_context')->nullable();
            $table->index(['farm_id', 'poultry_house_id', 'assignment_event_id', 'created_at', 'id'], 'sr_house_period_time_idx');
            $table->index(['sensor_id', 'assignment_event_id', 'created_at', 'id'], 'sr_device_period_time_idx');
        });
        Schema::table('alert_history', function (Blueprint $table) {
            $table->index(['farm_id', 'poultry_house_id', 'sensor_id', 'assignment_event_id', 'sensor_type', 'resolved_at'], 'ah_house_incident_idx');
            $table->index(['poultry_house_id', 'triggered_at', 'id'], 'ah_house_time_idx');
        });
    }

    public function down(): void
    {
        PoultryHouseSchema::forwardOnly();
    }
};
