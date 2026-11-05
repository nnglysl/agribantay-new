<?php

use AgriBantay\MariaDbPrototype\MariaDbPoultryHouseSchema;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

require_once __DIR__.'/MariaDbPoultryHouseSchema.php';

return new class extends Migration
{
    public function up(): void
    {
        MariaDbPoultryHouseSchema::requireBaseline();
        if (! Schema::hasTable('poultry_houses')) {
            throw new RuntimeException('Install the reviewed poultry house inventory foundation first.');
        }
        MariaDbPoultryHouseSchema::absentColumns('device_assignment_events', ['from_house_id', 'to_house_id', 'event_kind',
            'from_house_number', 'to_house_number', 'from_farm_name', 'to_farm_name']);
        Schema::table('device_assignment_events', function (Blueprint $table) {
            // No parent FKs: retain attribution even after Option A deletes operational rows.
            $table->unsignedBigInteger('from_house_id')->nullable();
            $table->unsignedBigInteger('to_house_id')->nullable();
            $table->unsignedBigInteger('from_house_number')->nullable();
            $table->unsignedBigInteger('to_house_number')->nullable();
            $table->string('from_farm_name')->nullable();
            $table->string('to_farm_name')->nullable();
            $table->string('event_kind', 40)->nullable();
            $table->unique(['id', 'sensor_id', 'to_farm_id', 'to_house_id'], 'dae_device_context_uq');
            $table->unique(['id', 'to_farm_id', 'to_house_id'], 'dae_house_context_uq');
            $table->index(['sensor_id', 'id'], 'dae_sensor_event_idx');
            $table->index(['to_house_id', 'id'], 'dae_house_event_idx');
        });
    }

    public function down(): void
    {
        MariaDbPoultryHouseSchema::forwardOnly();
    }
};
