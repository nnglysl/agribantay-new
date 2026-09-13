<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_recommendations', function (Blueprint $table) {
            $table->id();
            // unique — exactly one persisted recommendation per farm,
            // overwritten on regeneration rather than accumulating rows.
            $table->foreignId('farm_id')->unique()->constrained()->cascadeOnDelete();

            // Only what Gemini actually generates gets stored here — the
            // English root cause / tips / recommended action themselves
            // are deterministic (RootCauseService / PreventiveActionService)
            // and stay cheap to recompute live on every request; only the
            // Gemini-authored prose and translations are worth caching.
            $table->text('explanation_en')->nullable();
            $table->text('explanation_fil')->nullable();
            $table->text('main_action_fil')->nullable();
            $table->json('tips_fil')->nullable();

            // The actual "once per calendar day" gate.
            $table->date('generated_date')->nullable();

            // Set true by FarmStatusService the moment a farm transitions
            // INTO Critical — forces the next request to regenerate
            // immediately, bypassing the once-daily gate, without needing
            // a second code path.
            $table->boolean('force_refresh')->default(false);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_recommendations');
    }
};