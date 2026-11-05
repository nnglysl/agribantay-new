<?php

use AgriBantay\MariaDbPrototype\MariaDbPoultryHouseSchema;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require_once __DIR__.'/MariaDbPoultryHouseSchema.php';

return new class extends Migration
{
    public function up(): void
    {
        MariaDbPoultryHouseSchema::requireBaseline();
        foreach (['poultry_houses', 'poultry_house_initializations'] as $table) {
            if (Schema::hasTable($table)) {
                throw new RuntimeException('Existing '.$table.' requires review; historical house migrations must not be replayed.');
            }
        }
        MariaDbPoultryHouseSchema::absentColumns('farms', ['last_house_number', 'house_inventory_verified_at']);
        Schema::create('poultry_houses', function (Blueprint $table) {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('farm_id')->constrained('farms')->restrictOnDelete()->restrictOnUpdate();
            $table->unsignedBigInteger('house_number');
            // The public name is always derived as "House {house_number}".
            $table->enum('status', ['Active', 'Inactive'])->default('Active');
            $table->uuid('creation_request_id')->nullable();
            $table->timestamp('deactivated_at')->nullable();
            $table->timestamp('reactivated_at')->nullable();
            $table->timestamps();
            $table->unique(['farm_id', 'house_number'], 'ph_farm_number_uq');
            $table->unique(['farm_id', 'creation_request_id'], 'ph_farm_request_uq');
            $table->unique(['farm_id', 'id'], 'ph_farm_id_uq');
            $table->index(['farm_id', 'status', 'house_number'], 'ph_farm_status_number_idx');
        });
        DB::statement('ALTER TABLE poultry_houses ADD CONSTRAINT ph_number_positive CHECK (house_number > 0)');
        // Prevent moving/renumbering an existing house; status changes remain possible.
        // No DELETE trigger: Option A explicitly permits authorized parent-farm cleanup.
        DB::unprepared("CREATE TRIGGER ph_identity_immutable_bu BEFORE UPDATE ON poultry_houses FOR EACH ROW
            BEGIN
                IF NOT (OLD.id <=> NEW.id) OR NOT (OLD.farm_id <=> NEW.farm_id)
                    OR NOT (OLD.house_number <=> NEW.house_number) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Poultry house identity and number are immutable';
                END IF;
            END");
        Schema::create('poultry_house_initializations', function (Blueprint $table) {
            $table->engine = 'InnoDB';
            $table->id();
            // Recorded identity, intentionally NOT an operational-parent FK.
            // This evidence survives approved parent-farm permanent deletion.
            $table->unsignedBigInteger('farm_id')->unique('phi_farm_uq');
            $table->uuid('operation_id');
            $table->enum('source', ['registration', 'verified_population']);
            $table->unsignedBigInteger('initial_house_count');
            $table->string('verification_reference', 255);
            $table->char('manifest_sha256', 64)->nullable();
            $table->unsignedBigInteger('verified_by')->nullable();
            $table->string('verifier_role', 50);
            $table->timestamp('completed_at');
            $table->index('operation_id', 'phi_operation_idx');
        });
        DB::statement("ALTER TABLE poultry_house_initializations ADD CONSTRAINT phi_registration_count CHECK (source <> 'registration' OR initial_house_count > 0)");
        Schema::table('farms', function (Blueprint $table) {
            // Allocations, not a claim about the unknown physical inventory.
            $table->unsignedBigInteger('last_house_number')->default(0);
            $table->timestamp('house_inventory_verified_at')->nullable();
        });
    }

    public function down(): void
    {
        MariaDbPoultryHouseSchema::forwardOnly();
    }
};
