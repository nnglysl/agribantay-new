<?php
// database/migrations/2026_08_21_000100_widen_type_column_on_sms_logs_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sms_logs', function (Blueprint $table) {
            $table->string('type', 50)->change();
        });
    }

    public function down(): void
    {
        // Not reversing to the exact original enum — same reasoning as
        // the notifications.type widening: don't risk losing rows with
        // the new 'Maintenance Compliance' type already stored.
    }
};