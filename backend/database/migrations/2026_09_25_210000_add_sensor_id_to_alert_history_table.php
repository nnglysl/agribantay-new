<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An incident used to be keyed on (farm_id, sensor_type) alone, which was
 * correct only while a farm had exactly one device. A farm now runs one unit
 * per poultry house, so two houses both running hot produced ONE shared
 * "Temperature Critical" row — and nothing in it could say which house to
 * walk to.
 *
 * sensor_id is nullable on purpose: rows recorded before this migration have
 * no device attached and must stay readable. It's nullOnDelete rather than
 * cascade for the same reason — retiring a unit must never erase the history
 * of what happened at that farm.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('alert_history', function (Blueprint $table) {
            $table->foreignId('sensor_id')
                ->nullable()
                ->after('farm_id')
                ->constrained('sensors')
                ->nullOnDelete();

            // Replaces the (farm_id, sensor_type, resolved_at) index: the
            // open-incident lookup now includes sensor_id, and a prefix of
            // this index still serves the farm-wide queries.
            $table->index(
                ['farm_id', 'sensor_id', 'sensor_type', 'resolved_at'],
                'alert_history_open_incident_index'
            );
        });
    }

    public function down(): void
    {
        Schema::table('alert_history', function (Blueprint $table) {
            $table->dropIndex('alert_history_open_incident_index');
            $table->dropForeign(['sensor_id']);
            $table->dropColumn('sensor_id');
        });
    }
};
