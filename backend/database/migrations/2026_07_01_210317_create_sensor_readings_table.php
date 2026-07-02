<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sensor_readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->onDelete('cascade');
            $table->foreignId('poultry_house_id')->nullable()->constrained()->onDelete('set null');
            $table->decimal('ammonia', 8, 2)->nullable();
            $table->decimal('temperature', 8, 2)->nullable();
            $table->decimal('humidity', 8, 2)->nullable();
            $table->decimal('moisture', 8, 2)->nullable();
            $table->enum('ammonia_status', ['Normal', 'Warning', 'Critical'])->default('Normal');
            $table->enum('temperature_status', ['Normal', 'Warning', 'Critical'])->default('Normal');
            $table->enum('humidity_status', ['Normal', 'Warning', 'Critical'])->default('Normal');
            $table->enum('moisture_status', ['Normal', 'Warning', 'Critical'])->default('Normal');
            $table->boolean('is_mock')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sensor_readings');
    }
};