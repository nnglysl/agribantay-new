<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The farmer-facing name for the poultry house a unit is installed in —
 * "House 1", "Bagong kulungan", whatever the owner actually calls it.
 *
 * Until now every screen identified a house by its device name ("AGB-D01").
 * That is the hardware's serial identity, useful to the LGU and meaningless
 * to the person who has to walk to the right building.
 *
 * It lives on `sensors` rather than in the `poultry_houses` table because
 * assignment is already per-device: one unit, one house. Adding a second
 * table would mean maintaining a house record whose only content is a name.
 *
 * Nullable: existing devices have no house name, and the UI falls back to
 * the device name rather than inventing one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            $table->string('house_name', 60)->nullable()->after('label');
        });
    }

    public function down(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            $table->dropColumn('house_name');
        });
    }
};
