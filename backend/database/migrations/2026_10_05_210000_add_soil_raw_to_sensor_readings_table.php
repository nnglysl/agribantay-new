<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Keep the capacitive probe's raw ADC count beside the moisture computed
 * from it — the same argument as ammonia_raw, and for the moisture column
 * it is now the more urgent of the two.
 *
 * WHY THIS IS NEEDED
 *
 * `moisture` has been written by three different conversions:
 *
 *   placeholder   100 - (raw / 4095) * 100
 *   two-point     (air - raw) / (air - water) * 100, per device
 *   polynomial    a * raw^2 + b * raw + c, per device
 *
 * Only the last is wet-basis moisture content; the first two are probe
 * indices that merely look like percentages. Which one produced a given row
 * depends on what was in .env the day it was written, and the per-device
 * air/water and polynomial values will keep changing as probes are
 * recalibrated and swapped between farms.
 *
 * The placeholder inverted cleanly, so raw used to be recoverable. The
 * two-point form does not invert without knowing that device's air and
 * water readings at that moment, and the quadratic does not invert without
 * its three coefficients and bounds. So without this column, the moment a
 * probe is recalibrated, every moisture reading already recorded becomes
 * uninterpretable: there is no way to tell what the sensor actually
 * measured, only what some earlier formula made of it.
 *
 * With the raw count stored, a corrected fit is retroactive — the whole
 * history can be recomputed from the measurement rather than reconstructed
 * from a timeline of deploys. That is the difference between a calibration
 * the panel can audit and one that has to be taken on trust.
 *
 * FAULTY PROBES ARE RECORDED TOO. SensorIngestController treats soil_raw 0
 * as a hardware fault and stores a NULL `moisture` for it. The raw 0 is
 * still written here, so "the probe reported nothing" stays distinguishable
 * from "this row predates the column" — the first is a diagnosable fault,
 * the second is simply unknown.
 *
 * SAFETY
 *
 * Nullable and appended at the end of the table, so MySQL 8 applies it with
 * INSTANT DDL: no table rebuild, no lock, and not one existing row is read
 * or rewritten. Rows written before this migration keep a NULL raw, which
 * correctly says "not recorded".
 *
 * Range: the ESP32 ADC is 12-bit (0-4095), so unsignedSmallInteger (0-65535)
 * is ample and a quarter the width of a default integer column.
 *
 * DEPLOY ORDER MATTERS, twice over. Run the ammonia_raw migration first
 * (this one positions itself after that column), and run both BEFORE
 * uploading the updated SensorIngestController — otherwise the controller
 * writes a column that does not exist yet and every incoming reading is
 * rejected until it does.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sensor_readings', function (Blueprint $table) {
            $table->unsignedSmallInteger('soil_raw')
                ->nullable()
                ->after('ammonia_raw')
                ->comment('Raw capacitive probe ADC count (0-4095) the moisture value was computed from.');
        });
    }

    public function down(): void
    {
        Schema::table('sensor_readings', function (Blueprint $table) {
            $table->dropColumn('soil_raw');
        });
    }
};
