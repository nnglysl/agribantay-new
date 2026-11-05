<?php

use Database\Support\PoultryHouseSchema;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require_once __DIR__.'/../support/PoultryHouseSchema.php';

return new class extends Migration
{
    public function up(): void
    {
        PoultryHouseSchema::requireBaseline();
        if (! Schema::hasColumn('device_assignment_events', 'to_house_id')) {
            throw new RuntimeException('Install the reviewed house assignment-event context first.');
        }
        PoultryHouseSchema::absentColumns('sensors', ['poultry_house_id', 'current_assignment_event_id', 'active_house_slot']);
        Schema::table('sensors', function (Blueprint $table) {
            $table->unsignedBigInteger('poultry_house_id')->nullable();
            $table->unsignedBigInteger('current_assignment_event_id')->nullable();
            $table->unsignedBigInteger('active_house_slot')
                ->storedAs("CASE WHEN status = 'Active' THEN poultry_house_id ELSE NULL END");
            $table->unique('active_house_slot', 'sensors_active_house_uq');
            $table->foreign(['farm_id', 'poultry_house_id'], 'sensors_house_membership_fk')
                ->references(['farm_id', 'id'])->on('poultry_houses')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign(['current_assignment_event_id', 'id', 'farm_id', 'poultry_house_id'], 'sensors_assignment_context_fk')
                ->references(['id', 'sensor_id', 'to_farm_id', 'to_house_id'])->on('device_assignment_events')
                ->restrictOnDelete()->restrictOnUpdate();
        });
        DB::statement('ALTER TABLE sensors ADD CONSTRAINT sensors_house_context_ck CHECK (
            (poultry_house_id IS NULL AND current_assignment_event_id IS NULL)
            OR (poultry_house_id IS NOT NULL AND current_assignment_event_id IS NOT NULL))');
        // MySQL forbids a CHECK on farm_id because its existing FK uses SET NULL.
        // Keep that legacy FK intact; enforce the additional house rule in triggers.
        foreach (['INSERT' => 'bi', 'UPDATE' => 'bu'] as $operation => $suffix) {
            DB::unprepared("CREATE TRIGGER sensors_house_context_{$suffix} BEFORE {$operation} ON sensors FOR EACH ROW
                BEGIN
                    DECLARE house_status VARCHAR(8);
                    IF NEW.poultry_house_id IS NOT NULL THEN
                        IF NEW.farm_id IS NULL THEN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'House assignment requires its farm';
                        END IF;
                        SELECT status INTO house_status FROM poultry_houses WHERE id = NEW.poultry_house_id FOR SHARE;
                        IF house_status <> 'Active' THEN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Devices can only be associated with an Active house';
                        END IF;
                    END IF;
                END");
        }
        DB::unprepared("CREATE TRIGGER ph_deactivation_unassigned_bu BEFORE UPDATE ON poultry_houses FOR EACH ROW
            BEGIN
                DECLARE associated_device BIGINT UNSIGNED DEFAULT NULL;
                IF NEW.status = 'Inactive' AND OLD.status <> 'Inactive' THEN
                    SELECT id INTO associated_device FROM sensors WHERE poultry_house_id = OLD.id ORDER BY id LIMIT 1 FOR UPDATE;
                    IF associated_device IS NOT NULL THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Explicitly unassign every Active and Inactive device before house deactivation';
                    END IF;
                END IF;
            END");
        // Legacy farm-only assignments remain valid; farm_id is never made unique.
    }

    public function down(): void
    {
        PoultryHouseSchema::forwardOnly();
    }
};
