<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            if (!Schema::hasColumn('farms', 'farm_type')) {
                $table->string('farm_type')->nullable()->after('farm_name');
            }
            if (!Schema::hasColumn('farms', 'farm_area')) {
                $table->decimal('farm_area', 12, 2)->nullable()->after('farm_size');
            }
            if (!Schema::hasColumn('farms', 'farm_area_unit')) {
                $table->string('farm_area_unit')->default('sqm')->after('farm_area');
            }
            // Guarded in case an earlier migration you haven't shown me
            // already added these — safe either way.
            if (!Schema::hasColumn('farms', 'latitude')) {
                $table->decimal('latitude', 10, 7)->nullable();
            }
            if (!Schema::hasColumn('farms', 'longitude')) {
                $table->decimal('longitude', 10, 7)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            $table->dropColumn(['farm_type', 'farm_area', 'farm_area_unit']);
        });
    }
};