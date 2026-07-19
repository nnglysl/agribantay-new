<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            if (!Schema::hasColumn('sensors', 'installed_at')) {
                $table->date('installed_at')->nullable()->after('poultry_house_id');
            }
            if (!Schema::hasColumn('sensors', 'sensor_code')) {
                $table->string('sensor_code')->nullable()->unique()->after('installed_at');
            }
        });

        // Backfill any sensors that already existed before this migration
        // (e.g. the ones auto-migrated from farms.device_key earlier, which
        // were inserted via a raw query and so never triggered the model's
        // code-generation event).
        DB::table('sensors')->whereNull('sensor_code')->orderBy('id')->get()->each(function ($sensor) {
            $installedAt = Carbon::parse($sensor->installed_at ?? $sensor->created_at ?? now());
            $base = 'SFN' . $installedAt->format('dmy');

            $code = $base;
            $suffix = 65; // 'A'
            while (DB::table('sensors')->where('sensor_code', $code)->exists()) {
                $code = $base . chr($suffix);
                $suffix++;
            }

            DB::table('sensors')->where('id', $sensor->id)->update([
                'installed_at' => $installedAt->toDateString(),
                'sensor_code'  => $code,
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            $table->dropColumn(['sensor_code', 'installed_at']);
        });
    }
};