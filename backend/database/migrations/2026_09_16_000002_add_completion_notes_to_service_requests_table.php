<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `notes` used to hold both the farmer's original request text AND the
 * notes typed when marking the request completed — the latter overwrote the
 * former. Completion notes now get their own column so the farmer's original
 * description survives (and Reopen can restore a request faithfully).
 * Existing rows are left as-is: whatever is in `notes` keeps displaying.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->text('completion_notes')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropColumn('completion_notes');
        });
    }
};
