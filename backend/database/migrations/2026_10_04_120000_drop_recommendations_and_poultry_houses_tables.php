<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Remove two features that were built, superseded, and left behind.
 *
 * `recommendations` was the first pass at farm advice: a controller that
 * recomputed tips on read, behind GET /api/farmer/recommendations, shown by a
 * page that was never added to the router. The AI Insight layer replaced it —
 * the Farm Owner dashboard reads its tips from the insight endpoint, which
 * caches into `ai_recommendations`. The old table was never written to on
 * production (0 rows) because the only route that could fill it was
 * unreachable from the UI.
 *
 * `poultry_houses` was meant to model the buildings on a farm, with sensors
 * and readings pointing at one. Nothing ever created a house — there is no
 * create path anywhere in the codebase — and the UI's "House" came to mean
 * "device" instead: Farmer/DashboardController works from `sensors`, one
 * device per house. On production the table held 0 rows and not one sensor or
 * reading carried a poultry_house_id.
 *
 * Both were verified empty on the live database before this was written.
 *
 * REVERSIBILITY
 * down() rebuilds both tables and both columns, so the schema can be restored.
 * It cannot restore rows, which is honest rather than lossy: there were none.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The pointing columns go first: the tables they point at cannot be
        // dropped while a foreign key still references them.
        if (Schema::hasColumn('sensor_readings', 'poultry_house_id')) {
            Schema::table('sensor_readings', function (Blueprint $table) {
                $table->dropForeign(['poultry_house_id']);
                $table->dropColumn('poultry_house_id');
            });
        }

        if (Schema::hasColumn('sensors', 'poultry_house_id')) {
            Schema::table('sensors', function (Blueprint $table) {
                $table->dropForeign(['poultry_house_id']);
                $table->dropColumn('poultry_house_id');
            });
        }

        Schema::dropIfExists('poultry_houses');
        Schema::dropIfExists('recommendations');
    }

    public function down(): void
    {
        if (! Schema::hasTable('recommendations')) {
            Schema::create('recommendations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
                $table->enum('type', [
                    'Ventilation Improvement',
                    'Litter Management',
                    'Equipment Check',
                    'Community Alert',
                ]);
                $table->enum('priority', ['Priority', 'Routine', 'Scheduled', 'Regional']);
                $table->text('root_cause');
                $table->text('preventive_action');
                $table->text('suggested_next_step');
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('poultry_houses')) {
            Schema::create('poultry_houses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
                $table->string('house_name');
                $table->integer('capacity')->default(0);
                $table->enum('status', ['Active', 'Inactive'])->default('Active');
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('sensors', 'poultry_house_id')) {
            Schema::table('sensors', function (Blueprint $table) {
                $table->foreignId('poultry_house_id')->nullable()->after('farm_id')->constrained()->nullOnDelete();
            });
        }

        if (! Schema::hasColumn('sensor_readings', 'poultry_house_id')) {
            Schema::table('sensor_readings', function (Blueprint $table) {
                $table->foreignId('poultry_house_id')->nullable()->after('sensor_id')->constrained()->onDelete('set null');
            });
        }
    }
};
