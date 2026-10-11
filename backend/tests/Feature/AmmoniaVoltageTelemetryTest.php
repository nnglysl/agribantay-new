<?php

namespace Tests\Feature;

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
        // Apply the real migration to an old schema/row: no history is invented.
        DB::table('sensor_readings')->insert([
            'farm_id' => 1, 'sensor_id' => 1, 'ammonia_raw' => 429, 'ammonia' => 1.56,
        ]);
        $migration = require database_path('migrations/2026_10_10_120000_add_ammonia_adc_mv_to_sensor_readings_table.php');
        $migration->up();
        $migration->up(); // Safe if the column was already added.
        $this->assertNull(DB::table('sensor_readings')->value('ammonia_adc_mv'));
        $this->assertEquals(1.56, DB::table('sensor_readings')->value('ammonia'));

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

    public function test_old_and_new_firmware_store_distinct_voltage_samples_without_changing_ppm(): void
    {
        $old = $this->postJson('/api/sensor-readings', $this->payload())->assertOk();
        $old->assertJsonPath('data.ammonia_adc_mv', null);
        $legacyPpm = $old->json('data.ammonia');
        foreach ([433, 0] as $millivolts) {
            $response = $this->postJson('/api/sensor-readings', $this->payload() + [
                'ammonia_adc_mv' => $millivolts,
            ])->assertOk();
            $response->assertJsonPath('data.ammonia_adc_mv', $millivolts);
            $this->assertSame($legacyPpm, $response->json('data.ammonia'));
            $row = DB::table('sensor_readings')->where('id', $response->json('data.id'))->first();
            $this->assertSame(364, (int) $row->ammonia_raw);
            $this->assertSame($millivolts, (int) $row->ammonia_adc_mv);
        }
    }

    public function test_invalid_voltage_is_rejected_without_inserting_a_reading(): void
    {
        $before = DB::table('sensor_readings')->count();
        foreach ([-1, 65536, 433.5, '433mV', ['bad']] as $value) {
            $this->postJson('/api/sensor-readings', $this->payload() + ['ammonia_adc_mv' => $value])
                ->assertUnprocessable()->assertJsonValidationErrors('ammonia_adc_mv');
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
