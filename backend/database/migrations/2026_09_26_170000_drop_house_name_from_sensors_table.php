<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Removes `sensors.house_name`, added earlier the same day.
 *
 * It was introduced to support a per-house label in the farmer UI, but that
 * label was never actually asked for — devices are identified everywhere by
 * their device name, which the LGU already assigns and prints on the unit.
 * A second, hand-typed name for the same thing is one more field to keep
 * accurate and one more way for two screens to disagree.
 *
 * Written as a forward migration rather than by editing the one that added
 * the column, because that one has already run in production; rewriting
 * history would leave the deployed database with a column Laravel believes
 * was never created.
 *
 * The column was live for a few hours and no UI ever wrote to it, so this
 * drops nothing a user entered. `down()` restores the column, empty.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('sensors', 'house_name')) {
            return;
        }

        Schema::table('sensors', function (Blueprint $table) {
            $table->dropColumn('house_name');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('sensors', 'house_name')) {
            return;
        }

        Schema::table('sensors', function (Blueprint $table) {
            $table->string('house_name', 60)->nullable()->after('label');
        });
    }
};
