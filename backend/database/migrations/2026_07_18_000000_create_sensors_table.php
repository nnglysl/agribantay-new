<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sensors')) {
            Schema::create('sensors', function (Blueprint $table) {
                $table->id();
                $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
                // Nullable — small/medium farms with a single sensor don't need
                // to classify it by poultry house.
                $table->foreignId('poultry_house_id')->nullable()->constrained()->nullOnDelete();
                $table->string('device_key')->unique();
                $table->string('label')->nullable(); // e.g. "Sensor 1", "North Coop Sensor"
                $table->enum('status', ['Active', 'Inactive'])->default('Active');
                $table->timestamps();
            });
        }

        // Every farm currently has its device_key stored directly on the
        // farms table (one device per farm, hard-coded into the ingestion
        // lookup). Before that column stops being used, migrate each
        // existing key into its own Sensor row — so a device that's
        // already deployed and sending readings in the field keeps working
        // without any reconfiguration on the hardware side.
        if (Schema::hasColumn('farms', 'device_key')) {
            DB::table('farms')
                ->whereNotNull('device_key')
                ->get(['id', 'device_key'])
                ->each(function ($farm) {
                    DB::table('sensors')->insertOrIgnore([
                        'farm_id'    => $farm->id,
                        'device_key' => $farm->device_key,
                        'label'      => 'Sensor 1',
                        'status'     => 'Active',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                });
        }

        Schema::table('sensor_readings', function (Blueprint $table) {
            if (!Schema::hasColumn('sensor_readings', 'sensor_id')) {
                $table->foreignId('sensor_id')->nullable()->after('farm_id')
                    ->constrained()->nullOnDelete();
            }
        });

        // Backfill sensor_id on existing readings using each farm's
        // just-migrated sensor, so historical data stays linked too.
        DB::statement('
            UPDATE sensor_readings sr
            JOIN sensors s ON s.farm_id = sr.farm_id
            SET sr.sensor_id = s.id
            WHERE sr.sensor_id IS NULL
        ');
    }

    public function down(): void
    {
        Schema::table('sensor_readings', function (Blueprint $table) {
            if (Schema::hasColumn('sensor_readings', 'sensor_id')) {
                $table->dropConstrainedForeignId('sensor_id');
            }
        });
        Schema::dropIfExists('sensors');
    }
};