<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('farms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('farm_name');
            $table->string('owner_name');
            $table->string('mobile_number')->nullable();
            $table->string('barangay');
            $table->string('municipality')->default('San Jose');
            $table->string('province')->default('Batangas');
            $table->text('address')->nullable();
            $table->integer('num_birds')->default(0);
            $table->enum('farm_size', ['Small', 'Semi-Commercial', 'Commercial'])->default('Small');
            $table->enum('status', ['Active', 'Inactive', 'Deactivated'])->default('Active');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('farms');
    }
};