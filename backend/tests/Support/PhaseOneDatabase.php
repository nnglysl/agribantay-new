<?php

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class PhaseOneDatabase
{
    /** Extra tables used only by the isolated corrective regression suite. */
    public static function correctionTables(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->string('email')->nullable());
        Schema::create('ai_recommendations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id')->unique();
            foreach (['explanation_en', 'explanation_fil', 'main_action_fil', 'tips_fil'] as $field) {
                $t->text($field)->nullable();
            }
            $t->date('generated_date')->nullable();
            $t->boolean('force_refresh')->default(false);
            $t->timestamps();
        });
        Schema::create('maintenance_notifications', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
        });
        Schema::create('personal_access_tokens', function (Blueprint $t) {
            $t->id();
            $t->string('tokenable_type');
            $t->unsignedBigInteger('tokenable_id');
        });
        Schema::create('generated_reports', function (Blueprint $t) {
            $t->id();
            $t->text('payload');
        });
    }

    public static function create(bool $withVoltage = true): void
    {
        SmsAlertDatabase::create($withVoltage);
        Schema::table('service_requests', function (Blueprint $t) {
            $t->string('service_type')->nullable();
            $t->timestamp('scheduled_at')->nullable();
        });
        Schema::table('inspections', fn (Blueprint $t) => $t->timestamp('scheduled_at')->nullable());
        Schema::create('maintenance_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            $t->string('maintenance_type');
            $t->date('performed_at');
            $t->string('notes')->nullable();
            $t->string('photo_path')->nullable();
            $t->timestamps();
        });
        Schema::create('manure_disposal_records', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            $t->date('disposal_date');
            $t->string('disposal_method');
            $t->string('buyer_name')->nullable();
            $t->decimal('quantity')->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
        });
    }
}
