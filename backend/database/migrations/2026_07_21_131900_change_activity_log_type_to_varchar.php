<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // activity_logs.type was an ENUM with a fixed list of log categories.
        // MySQL rejects any value outside an ENUM's definition — that's the
        // "Data truncated for column 'type'" error when the admin schedules a
        // service request and the controller logs type 'Service'.
        // Switching to VARCHAR means new log categories never need a schema
        // migration again. Same fix already applied to service_requests.service_type.
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->string('type', 50)->change();
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->string('type', 50)->change();
        });
    }
};