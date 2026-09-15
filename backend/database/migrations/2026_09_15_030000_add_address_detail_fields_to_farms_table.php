<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            $table->string('lot_number')->nullable()->after('address');
            $table->string('street')->nullable()->after('lot_number');
            $table->string('landmark')->nullable()->after('street');
        });
    }

    public function down(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            $table->dropColumn(['lot_number', 'street', 'landmark']);
        });
    }
};
