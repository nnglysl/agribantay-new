<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maintenance_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            // Fixed to 'Full Manure Clean-out' for now — the smaller,
            // more frequent litter-management actions from the AI
            // Insight tips are deliberately NOT tracked here, since they
            // don't follow a fixed schedule the way a full clean-out does.
            $table->string('maintenance_type')->default('Full Manure Clean-out');
            $table->date('performed_at');
            $table->text('notes')->nullable();
            $table->string('photo_path'); // required — no photo, no log
            $table->timestamps();

            $table->index(['farm_id', 'performed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_logs');
    }
};