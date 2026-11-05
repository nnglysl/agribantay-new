<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('farm_control_documents', function (Blueprint $table) {
            $table->id();
            // Preserve submissions: deleting a farm must not silently cascade.
            $table->foreignId('farm_id')->constrained()->restrictOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            // Account validation allows 255 characters in each name part.
            $table->string('uploader_name', 511);
            $table->enum('category', ['odor_control', 'fly_control']);
            $table->string('original_name', 200);
            $table->string('file_path')->unique();
            $table->string('mime_type', 64);
            $table->unsignedBigInteger('file_size');
            $table->text('remarks')->nullable();
            $table->timestamps();
            $table->index(['farm_id', 'category', 'id']);
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('farm_control_documents') && DB::table('farm_control_documents')->exists()) {
            throw new RuntimeException('Cannot roll back populated farm control document history.');
        }
        Schema::dropIfExists('farm_control_documents');
    }
};
