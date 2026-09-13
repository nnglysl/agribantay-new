<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('password_reset_otps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('channel', ['email', 'sms']);
            // Hashed, never stored in plaintext — same principle as passwords.
            $table->string('code_hash');
            $table->timestamp('expires_at');
            // Set once the 6-digit code is successfully checked.
            $table->timestamp('verified_at')->nullable();
            // Generated only after verified_at is set — this, not the OTP
            // itself, is what authorizes the final password-reset step, so
            // the OTP can't be replayed even if it leaked somewhere.
            $table->string('reset_token')->nullable()->unique();
            $table->timestamp('reset_token_expires_at')->nullable();
            // Set once the password is actually changed — makes the whole
            // row single-use end to end, not just the code.
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'channel']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_otps');
    }
};