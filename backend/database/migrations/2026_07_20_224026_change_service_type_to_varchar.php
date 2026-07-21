<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // service_type was an ENUM created with only 'Vaccine Request' and
        // 'Odor Control Request'. MySQL truncates/rejects any value outside
        // an ENUM's defined list — that's the "Data truncated for column"
        // error when submitting Blood Test or Fly Control requests.
        // Switching to VARCHAR means new service types never need a schema
        // migration again; validation in the controller already handles
        // which values are allowed.
        Schema::table('service_requests', function (Blueprint $table) {
            $table->string('service_type', 100)->change();
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->enum('service_type', ['Vaccine Request', 'Odor Control Request'])->change();
        });
    }
};