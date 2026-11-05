<?php

namespace Tests\Feature;

use App\Models\SensorReading;
use App\Services\AlertHistoryService;
use App\Services\FarmStatusService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AmmoniaVoltageTelemetryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (DB::connection()->getDriverName() !== 'sqlite'
            || DB::connection()->getDatabaseName() !== ':memory:') {
            throw new \RuntimeException('This test requires isolated SQLite :memory:.');
        }
        Http::preventStrayRequests();
        Schema::create('farms', fn (Blueprint $t) => $t->id());
        Schema::create('sensors', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            foreach (['label', 'sensor_code', 'device_key', 'status'] as $field) {
                $t->string($field)->nullable();
            }
            $t->timestamp('last_seen_at')->nullable();
            $t->timestamps();
        });
        Schema::create('sensor_readings', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('farm_id');
            $t->unsignedBigInteger('sensor_id');
            foreach (['ammonia', 'temperature', 'humidity', 'moisture'] as $field) {
                $t->decimal($field, 8, 2)->nullable();
                $t->string($field.'_status')->nullable();
            }
            $t->unsignedSmallInteger('ammonia_raw')->nullable();
            $t->unsignedSmallInteger('soil_raw')->nullable();
            $t->boolean('is_mock')->default(false);
            $t->timestamps();
        });
        // Deliberately leave out the optional column, matching the local schema.
        DB::table('sensor_readings')->insert([
            'farm_id' => 1, 'sensor_id' => 1, 'ammonia_raw' => 429, 'ammonia' => 1.56,
        ]);
        DB::table('farms')->insert(['id' => 1]);
        DB::table('sensors')->insert([
            'id' => 1, 'farm_id' => 1, 'label' => 'AGB-TEST',
            'device_key' => 'test-only-key', 'status' => 'Active',
        ]);
        $this->mock(AlertHistoryService::class, function ($mock) {
            $mock->shouldReceive('recordReading')->andReturnNull();
            $mock->shouldReceive('closeOpenIncidents')->andReturnNull();
        });
        $this->mock(FarmStatusService::class, fn ($mock) => $mock->shouldReceive('syncStatus')->andReturnNull());
        config([
            'sensors.calibration.per_device' => [],
            'sensors.calibration.ammonia.raw_ref' => null,
            'sensors.calibration.ammonia.ppm_ref' => null,
            'sensors.calibration.ammonia.raw_clean_air' => null,
        ]);
    }

    public function test_five_field_ingestion_does_not_require_the_optional_voltage_column(): void
    {
        $before = (array) DB::table('sensor_readings')->where('id', 1)->first();
        $this->assertFalse(Schema::hasColumn('sensor_readings', 'ammonia_adc_mv'));
        $this->postJson('/api/sensor-readings', $this->payload())->assertOk()
            ->assertJsonMissingPath('data.ammonia_adc_mv')->assertJsonPath('data.ammonia', 8.89);
        $this->assertSame($before, (array) DB::table('sensor_readings')->where('id', 1)->first());
        $this->assertSame(364, (int) DB::table('sensor_readings')->latest('id')->value('ammonia_raw'));
        $this->assertFalse(Schema::hasColumn('sensor_readings', 'ammonia_adc_mv'));
    }

    public function test_unused_voltage_extras_are_ignored_and_do_not_change_results(): void
    {
        $baseline = $this->postJson('/api/sensor-readings', $this->payload())->assertOk()->json('data');
        foreach ([433, 0, -1, '433mV', ['unused']] as $extra) {
            $response = $this->postJson('/api/sensor-readings', $this->payload() + [
                'ammonia_adc_mv' => $extra,
            ])->assertOk();
            $response->assertJsonMissingPath('data.ammonia_adc_mv');
            foreach (['ammonia', 'ammonia_status', 'moisture', 'moisture_status', 'temperature', 'humidity'] as $field) {
                $this->assertSame($baseline[$field], $response->json('data.'.$field));
            }
        }
    }

    public function test_previously_stored_voltage_is_preserved_but_new_uploads_do_not_write_it(): void
    {
        // Simulate a deployment where the optional column already exists. Do
        // not run or delete the pending migration as part of this task.
        Schema::table('sensor_readings', fn (Blueprint $t) => $t->unsignedSmallInteger('ammonia_adc_mv')->nullable());
        DB::table('sensor_readings')->where('id', 1)->update(['ammonia_adc_mv' => 433]);
        $before = (array) DB::table('sensor_readings')->where('id', 1)->first();
        $this->postJson('/api/sensor-readings', $this->payload() + ['ammonia_adc_mv' => 999])->assertOk();
        $this->assertNull(DB::table('sensor_readings')->latest('id')->value('ammonia_adc_mv'));
        $this->assertSame($before, (array) DB::table('sensor_readings')->where('id', 1)->first());
        $this->assertSame(433, (int) SensorReading::findOrFail(1)->ammonia_adc_mv);
    }

    public function test_reference_pair_conversion_still_uses_raw_counts_with_or_without_voltage(): void
    {
        config(['sensors.calibration.ammonia.raw_ref' => 754, 'sensors.calibration.ammonia.ppm_ref' => 22.0]);
        $payload = array_replace($this->payload(), ['ammonia_raw' => 754]);
        $first = $this->postJson('/api/sensor-readings', $payload)->assertOk();
        $second = $this->postJson('/api/sensor-readings', $payload + ['ammonia_adc_mv' => 0])->assertOk();
        $this->assertEquals(22.0, $first->json('data.ammonia'));
        $this->assertSame($first->json('data.ammonia'), $second->json('data.ammonia'));
        $this->assertSame($first->json('data.ammonia_status'), $second->json('data.ammonia_status'));
    }

    public function test_the_five_required_fields_still_reject_incomplete_uploads(): void
    {
        $before = DB::table('sensor_readings')->count();
        foreach (array_keys($this->payload()) as $field) {
            $payload = $this->payload();
            unset($payload[$field]);
            $this->postJson('/api/sensor-readings', $payload)->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertSame($before, DB::table('sensor_readings')->count());
    }

    private function payload(): array
    {
        return [
            'device_key' => 'test-only-key', 'ammonia_raw' => 364,
            'temperature' => 31.1, 'humidity' => 71.3, 'soil_raw' => 0,
        ];
    }
}
