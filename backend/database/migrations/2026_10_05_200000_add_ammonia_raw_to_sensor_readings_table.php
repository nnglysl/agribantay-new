<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Keep the MQ-137's raw ADC count beside the ppm computed from it.
 *
 * WHY THIS IS NEEDED
 *
 * Until a device had a clean-air baseline, `ammonia` held the placeholder
 * scale (raw / 4095) * 100, which inverts exactly: raw = ammonia * 40.95.
 * The raw count was therefore always recoverable and storing it looked
 * redundant.
 *
 * That stopped being true the moment each device was calibrated. `ammonia`
 * now holds real ppm from
 *
 *     ppm = 10 ^ ((log10(Rs/Ro) - intercept) / slope)
 *
 * which is still invertible, but only for someone who knows which slope,
 * intercept, clean-air ratio and per-device baseline were in force on the
 * day that row was written. Those have already changed more than once
 * (AGB-D02 on 27 Sep 2026, AGB-D01 on 5 Oct 2026, and again whenever the
 * constants in config/sensors.php are corrected), so recovering raw means
 * reconstructing a timeline of deploys from memory. That is exactly the
 * kind of knowledge that does not survive a semester.
 *
 * Storing the raw count makes every future recalibration retroactive: the
 * whole history can be recomputed from the measurement itself rather than
 * from a reconstruction of it. It is also the honest thing to keep — raw
 * is what the sensor actually reported; ppm is an interpretation of it.
 *
 * SAFETY
 *
 * Nullable and appended at the end of the table, so MySQL 8 applies it
 * with INSTANT DDL: no table rebuild, no lock, and not one of the existing
 * rows is read or rewritten. Rows written before this migration keep a
 * NULL raw, which correctly says "not recorded" rather than inventing a
 * value. Those older rows remain recoverable through the inversion
 * described above.
 *
 * Range: the ESP32 ADC is 12-bit (0-4095), so unsignedSmallInteger (0-65535)
 * is ample and a quarter the width of a default integer column.
 *
 * DEPLOY ORDER MATTERS. Run this migration BEFORE uploading the updated
 * SensorIngestController, otherwise the controller writes a column that
 * does not exist yet and every incoming reading is rejected until it does.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sensor_readings', function (Blueprint $table) {
            $table->unsignedSmallInteger('ammonia_raw')
                ->nullable()
                ->after('is_mock')
                ->comment('Raw MQ-137 ADC count (0-4095) the ammonia value was computed from.');
        });
    }

    public function down(): void
    {
        Schema::table('sensor_readings', function (Blueprint $table) {
            $table->dropColumn('ammonia_raw');
        });
    }
};
