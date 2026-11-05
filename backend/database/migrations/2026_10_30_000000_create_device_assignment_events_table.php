<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Append-only evidence for NEW changes. Never infer/backfill old visits.
        Schema::create('device_assignment_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sensor_id');
            $table->unsignedBigInteger('activity_log_id')->unique();
            $table->unsignedBigInteger('from_farm_id')->nullable();
            $table->unsignedBigInteger('to_farm_id')->nullable();
            $table->unsignedBigInteger('reading_floor_id')->default(0);
            $table->unsignedBigInteger('alert_floor_id')->default(0);
            $table->timestamp('occurred_at');
            $table->index(['sensor_id', 'activity_log_id']);
            // IDs deliberately outlive deletions; no new cascading deletes or
            // restrictions are imposed on the application's existing records.
        });
    }

    public function down(): void
    {
        // A populated ledger is historical evidence. Roll application code
        // forward/back without destroying it; only an unused table may drop.
        if (Schema::hasTable('device_assignment_events')
            && DB::table('device_assignment_events')->exists()) {
            throw new RuntimeException('Cannot roll back populated device assignment history.');
        }
        Schema::dropIfExists('device_assignment_events');
    }
};
