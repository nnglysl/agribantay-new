<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manure_disposal_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->string('disposal_method'); // Sold, Composted on-site, Other
            $table->decimal('quantity', 8, 2);  // kilograms
            $table->string('buyer_name')->nullable(); // only meaningful when disposal_method = Sold
            $table->date('disposal_date');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['farm_id', 'disposal_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manure_disposal_records');
    }
};