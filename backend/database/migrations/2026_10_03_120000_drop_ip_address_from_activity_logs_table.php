<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops activity_logs.ip_address.
 *
 * The column was created for an audit trail that records WHERE an action came
 * from, but nothing was ever wired to it: all 38 ActivityLog::create() calls
 * omit it, no screen displays it, and every row in the live table is NULL. A
 * column that is always empty invites the question "why is this blank?" and
 * has no answer worth giving.
 *
 * Not collecting IP addresses is also a position worth being able to state
 * plainly, rather than appearing to collect them and failing.
 *
 * Unrelated to sessions.ip_address, which Laravel populates itself and which
 * this migration does not touch.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropColumn('ip_address');
        });
    }

    /**
     * Restores the column, nullable and empty — which is exactly the state it
     * was in before being dropped, since nothing ever wrote to it. No data is
     * lost by going either way.
     */
    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->string('ip_address')->nullable();
        });
    }
};
