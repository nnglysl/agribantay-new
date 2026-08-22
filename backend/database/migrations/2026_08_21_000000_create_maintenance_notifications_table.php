<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maintenance_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            // 'overdue_reminder' fires once when a farm first enters the
            // grace period; 'non_compliant_notice' fires once when it
            // exceeds it. anchor_date is the clean-out cycle this event
            // belongs to (last_performed_at, or the farm's created_at if
            // it has never logged one) — so if a farmer eventually logs a
            // clean-out and later becomes overdue again, that's a NEW
            // cycle and correctly gets notified again, rather than being
            // silently suppressed forever by this table.
            $table->enum('event', ['overdue_reminder', 'non_compliant_notice']);
            $table->date('anchor_date');
            $table->foreignId('sms_log_id')->nullable()->constrained('sms_logs')->nullOnDelete();
            $table->timestamp('sent_at');
            $table->timestamps();

            $table->unique(['farm_id', 'event', 'anchor_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_notifications');
    }
};