<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('manure_disposal_records', function (Blueprint $table) {
            $table->string('other_method_detail')->nullable()->after('disposal_method');
        });
    }

    public function down(): void
    {
        Schema::table('manure_disposal_records', function (Blueprint $table) {
            $table->dropColumn('other_method_detail');
        });
    }
};