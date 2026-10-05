<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cancelling an inspection recorded only the status change, so the record
 * could not say WHY — and neither could the notification the Farm Owner
 * receives. This mirrors `reschedule_reason`, which already stores the same
 * kind of explanation for the reschedule path.
 *
 * Nullable because every inspection cancelled before this migration has no
 * reason to backfill, and inventing one would put words in a staff member's
 * mouth. Rows written from here on always carry it — the endpoint requires it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inspections', function (Blueprint $table) {
            $table->text('cancellation_reason')->nullable()->after('reschedule_reason');
        });
    }

    public function down(): void
    {
        Schema::table('inspections', function (Blueprint $table) {
            $table->dropColumn('cancellation_reason');
        });
    }
};
