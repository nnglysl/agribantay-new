<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Prepares the sensors table for physical devices that rotate between
 * farms (2 devices, 10 farms, ~1 week each):
 *
 *   - farm_id becomes nullable so a device can be registered / unassigned
 *     without deleting its row. The FK switches from cascadeOnDelete to
 *     nullOnDelete for the same reason — deleting a farm must not destroy
 *     the physical device record.
 *   - last_seen_at records the last accepted reading from the device and
 *     drives the Online / Offline connectivity state (see
 *     FarmStatusService::connectivity()). Backfilled from each sensor's
 *     latest reading so already-deployed devices don't flip to Offline
 *     purely because the column is new.
 *
 * Historical readings are untouched: sensor_readings.farm_id is stamped
 * at ingestion time and is what every dashboard/report reads, so moving a
 * device never rewrites where old readings were collected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            $table->dropForeign(['farm_id']);
        });

        Schema::table('sensors', function (Blueprint $table) {
            $table->unsignedBigInteger('farm_id')->nullable()->change();
            $table->foreign('farm_id')->references('id')->on('farms')->nullOnDelete();

            if (!Schema::hasColumn('sensors', 'last_seen_at')) {
                $table->timestamp('last_seen_at')->nullable()->after('status');
            }
        });

        DB::table('sensors')->orderBy('id')->get(['id'])->each(function ($sensor) {
            $lastReadingAt = DB::table('sensor_readings')
                ->where('sensor_id', $sensor->id)
                ->max('created_at');

            if ($lastReadingAt) {
                DB::table('sensors')->where('id', $sensor->id)->update(['last_seen_at' => $lastReadingAt]);
            }
        });
    }

    public function down(): void
    {
        // Unassigned devices can't survive a NOT NULL farm_id — remove them
        // rather than let the column change fail halfway.
        DB::table('sensors')->whereNull('farm_id')->delete();

        Schema::table('sensors', function (Blueprint $table) {
            $table->dropForeign(['farm_id']);
            $table->dropColumn('last_seen_at');
        });

        Schema::table('sensors', function (Blueprint $table) {
            $table->unsignedBigInteger('farm_id')->nullable(false)->change();
            $table->foreign('farm_id')->references('id')->on('farms')->cascadeOnDelete();
        });
    }
};
