<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('sensor_readings', 'ammonia_adc_mv')) {
            Schema::table('sensor_readings', function (Blueprint $table) {
                $table->unsignedSmallInteger('ammonia_adc_mv')->nullable()
                    ->comment('ESP32 GPIO35 millivolts from a separate ADC sample; not supply voltage or ppm.');
            });
        }
        // Old rows intentionally stay NULL. No backfill, recalculation or alerts.
    }

    public function down(): void
    {
        Schema::table('sensor_readings', function (Blueprint $table) {
            $table->dropColumn('ammonia_adc_mv');
        });
    }
};
