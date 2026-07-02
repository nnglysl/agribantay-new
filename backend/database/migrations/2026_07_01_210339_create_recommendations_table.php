<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recommendations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->onDelete('cascade');
            $table->enum('type', [
                'Ventilation Improvement',
                'Litter Management',
                'Equipment Check',
                'Community Alert',
            ]);
            $table->enum('priority', ['Priority', 'Routine', 'Scheduled', 'Regional']);
            $table->text('root_cause');
            $table->text('preventive_action');
            $table->text('suggested_next_step');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recommendations');
    }
};