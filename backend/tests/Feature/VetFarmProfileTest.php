<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Veterinarian -> Farm Profile: the Current Conditions read-out.
 *
 * The Vet screen shows the latest reading as supporting context for a flock
 * assessment. The statuses are the ones already computed at ingest — this
 * endpoint classifies nothing — and the Vet must not be handed any device
 * administration data along the way.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=VetFarmProfileTest
 */
class VetFarmProfileTest extends TestCase
{
    use DatabaseTransactions;

    private User $vet;
    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=VetFarmProfileTest');
        }

        Http::fake();

        $this->vet = User::where('role', 'vet')->firstOrFail();

        $owner = User::create([
            'first_name'    => 'Vet',
            'last_name'     => Str::random(6),
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password'      => bcrypt('x'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        $this->farm = Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => 'Vet View Farm '.Str::random(4),
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Aya',
            'address'       => 'x',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    private function reading(array $overrides = []): SensorReading
    {
        return SensorReading::create(array_merge([
            'farm_id'            => $this->farm->id,
            'ammonia'            => 18.4,
            'ammonia_status'     => 'Safe',
            'temperature'        => 27.2,
            'temperature_status' => 'Safe',
            'humidity'           => 65,
            'humidity_status'    => 'Safe',
            'moisture'           => 42,
            'moisture_status'    => 'Safe',
        ], $overrides));
    }

    private function profile(): array
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($this->vet)
            ->getJson("/api/vet/farms/{$this->farm->id}")
            ->assertOk()
            ->json('data');
    }

    public function test_all_four_readings_are_available_with_their_statuses(): void
    {
        $this->reading();

        $current = $this->profile()['latest_reading'];

        $this->assertEqualsWithDelta(18.4, $current['ammonia'], 0.01);
        $this->assertEqualsWithDelta(27.2, $current['temperature'], 0.01);
        $this->assertEqualsWithDelta(65, $current['humidity'], 0.01);
        $this->assertEqualsWithDelta(42, $current['moisture'], 0.01);

        foreach (['ammonia', 'temperature', 'humidity', 'moisture'] as $metric) {
            $this->assertSame('Safe', $current["{$metric}_status"]);
        }
    }

    public function test_the_newest_reading_is_the_one_shown(): void
    {
        $this->reading(['ammonia' => 10.0]);
        $this->reading(['ammonia' => 33.3, 'ammonia_status' => 'Critical']);

        $current = $this->profile()['latest_reading'];

        $this->assertEqualsWithDelta(33.3, $current['ammonia'], 0.01);
        $this->assertSame('Critical', $current['ammonia_status']);
    }

    public function test_statuses_are_passed_through_not_recomputed(): void
    {
        // A deliberately odd pairing: a low value stored as Critical. The
        // endpoint must report what was stored rather than re-deciding, which
        // is what keeps Vet and Admin from disagreeing.
        $this->reading(['ammonia' => 1.0, 'ammonia_status' => 'Critical']);

        $this->assertSame('Critical', $this->profile()['latest_reading']['ammonia_status']);
    }

    public function test_a_farm_with_no_readings_returns_null_rather_than_zeros(): void
    {
        $profile = $this->profile();

        $this->assertNull($profile['latest_reading']);
    }

    public function test_advisory_metrics_are_named_so_the_ui_can_mark_them(): void
    {
        $this->reading();

        $alerting = $this->profile()['alerting_metrics'];

        $this->assertContains('ammonia', $alerting);
        $this->assertContains('moisture', $alerting);
        // Temperature and humidity are advisory — shown, but never badged as
        // having raised an alert.
        $this->assertNotContains('temperature', $alerting);
        $this->assertNotContains('humidity', $alerting);
    }

    public function test_the_profile_exposes_no_device_administration_data(): void
    {
        Sensor::create([
            'farm_id'    => $this->farm->id,
            'device_key' => 'AGB-SECRET'.Str::upper(Str::random(4)),
            'label'      => 'AGB-D01',
            'status'     => 'Active',
        ]);
        $this->reading();

        $body = json_encode($this->profile());

        foreach (['device_key', 'sim', 'imei', 'apn'] as $forbidden) {
            $this->assertStringNotContainsStringIgnoringCase($forbidden, $body, "the Vet profile leaked {$forbidden}");
        }
    }

    public function test_a_vet_cannot_reach_device_management(): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->vet)->getJson('/api/admin/sensors')->assertStatus(403);
    }

    public function test_the_trend_endpoint_still_serves_history(): void
    {
        $this->reading();

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->vet)
            ->getJson("/api/vet/farms/{$this->farm->id}/readings-history?hours=24")
            ->assertOk()
            ->assertJsonStructure(['data' => ['devices']]);
    }
}
