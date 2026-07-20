<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alert_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('sensor_type'); // ammonia, temperature, humidity, moisture
            $table->string('status');      // Warning, Critical — never Normal (a Normal reading closes/doesn't open a row)
            $table->float('value');        // the reading value at the time this incident opened (or last escalated)
            $table->timestamp('triggered_at');
            $table->timestamp('resolved_at')->nullable(); // null while the incident is still ongoing
            $table->timestamps();

            // Every "which alerts are currently open for this farm" lookup
            // filters on exactly these three columns together.
            $table->index(['farm_id', 'sensor_type', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alert_history');
    }
};