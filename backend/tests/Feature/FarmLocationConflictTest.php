<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\User;
use App\Services\FarmLocationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * One-farm-per-area rule (FarmLocationService) as enforced by the Admin
 * farm store/update endpoints.
 *
 * Same MySQL-only caveat as DeviceRotationTest; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmLocationConflictTest
 */
class FarmLocationConflictTest extends TestCase
{
    use DatabaseTransactions;

    // A spot inside the OSM boundary of Brgy. Calansayan (so the barangay <->
    // pin rule reports "verified") far from every seeded farm, and a second
    // spot ~1 km east of it, still inside the same boundary. 1° of longitude
    // at 13.9°N ≈ 108 km, so 0.01° ≈ 1.08 km.
    private const FREE_LAT = 13.8550;
    private const FREE_LNG = 121.0930;
    private const FREE2_LNG = 121.1030;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmLocationConflictTest');
        }

        Http::fake();
        $this->admin = User::where('role', 'admin')->firstOrFail();
    }

    private function makeOwner(): User
    {
        return User::create([
            'first_name'    => 'Test',
            'last_name'     => Str::random(6),
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password'      => bcrypt('password'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);
    }

    private function makeFarm(User $owner, float $lat, float $lng, string $name = 'Existing Farm'): Farm
    {
        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => $name,
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Calansayan',
            'address'       => 'Test',
            'farm_size'     => 'Small',
            'status'        => 'Active',
            'latitude'      => $lat,
            'longitude'     => $lng,
        ]);
    }

    private function storePayload(User $owner, float $lat, float $lng): array
    {
        return [
            'farm_owner_id' => $owner->id,
            'farm_name'     => 'New Farm',
            'farm_size'     => 'Small',
            'barangay'      => 'Calansayan',
            'address'       => 'Test address',
            'latitude'      => $lat,
            'longitude'     => $lng,
        ];
    }

    public function test_register_in_empty_area_is_allowed(): void
    {
        $owner = $this->makeOwner();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->storePayload($owner, self::FREE_LAT, self::FREE_LNG))
            ->assertStatus(200);

        $this->assertDatabaseHas('farms', ['farm_name' => 'New Farm', 'user_id' => $owner->id]);
    }

    public function test_register_in_occupied_area_is_rejected_with_message(): void
    {
        $owner = $this->makeOwner();
        $this->makeFarm($this->makeOwner(), self::FREE_LAT, self::FREE_LNG);

        // ~20 m north — not an exact coordinate match, still the same area.
        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->storePayload($owner, self::FREE_LAT + 0.00018, self::FREE_LNG))
            ->assertStatus(422)
            ->assertJsonPath('message', FarmLocationService::CONFLICT_MESSAGE)
            ->assertJsonPath('errors.location.0', FarmLocationService::CONFLICT_MESSAGE);

        $this->assertDatabaseMissing('farms', ['farm_name' => 'New Farm']);
    }

    public function test_proximity_uses_radius_not_exact_match(): void
    {
        $service = app(FarmLocationService::class);
        $this->makeFarm($this->makeOwner(), self::FREE_LAT, self::FREE_LNG);

        // Inside the radius (~20 m) → conflict; outside (~1 km) → free.
        $this->assertNotNull($service->findConflictingFarm(self::FREE_LAT + 0.00018, self::FREE_LNG));
        $this->assertNull($service->findConflictingFarm(self::FREE_LAT, self::FREE2_LNG));
        $this->assertEqualsWithDelta(1080, $service->distanceMeters(self::FREE_LAT, self::FREE_LNG, self::FREE_LAT, self::FREE2_LNG), 30);
    }

    public function test_edit_without_moving_location_is_allowed(): void
    {
        $farm = $this->makeFarm($this->makeOwner(), self::FREE_LAT, self::FREE_LNG, 'Farm A');

        $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$farm->id}", [
                'farm_name' => 'Farm A renamed',
                'latitude'  => self::FREE_LAT,
                'longitude' => self::FREE_LNG,
            ])
            ->assertStatus(200);

        $this->assertDatabaseHas('farms', ['id' => $farm->id, 'farm_name' => 'Farm A renamed']);
    }

    /**
     * The edit form always re-sends barangay/lot/street. When they are
     * unchanged the pin must stay put and the geocoder must not be called —
     * otherwise every save would snap the pin to the barangay centroid and
     * collide with any other farm that fell back to the same centroid.
     */
    public function test_edit_form_resave_with_unchanged_address_keeps_pin_and_skips_geocoding(): void
    {
        $owner = $this->makeOwner();
        $farm = $this->makeFarm($owner, self::FREE_LAT, self::FREE_LNG, 'Farm A');
        $farm->update(['lot_number' => 'Lot 12', 'street' => 'Purok 3', 'landmark' => 'Chapel']);

        $this->actingAs($this->admin)
            ->post("/api/admin/farms/{$farm->id}", [
                '_method'    => 'PUT',
                'farm_name'  => 'Farm A renamed',
                'barangay'   => 'Calansayan',
                'farm_size'  => 'Small',
                'lot_number' => 'Lot 12',
                'street'     => 'Purok 3',
                'landmark'   => 'Chapel',
            ], ['Accept' => 'application/json'])
            ->assertStatus(200);

        Http::assertNothingSent();

        $farm->refresh();
        $this->assertSame('Farm A renamed', $farm->farm_name);
        $this->assertEqualsWithDelta(self::FREE_LAT, (float) $farm->latitude, 0.000001);
        $this->assertEqualsWithDelta(self::FREE_LNG, (float) $farm->longitude, 0.000001);
    }

    public function test_edit_moving_into_another_farms_area_is_blocked(): void
    {
        $farmA = $this->makeFarm($this->makeOwner(), self::FREE_LAT, self::FREE_LNG, 'Farm A');
        $this->makeFarm($this->makeOwner(), self::FREE_LAT, self::FREE2_LNG, 'Farm B');

        $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$farmA->id}", [
                'latitude'  => self::FREE_LAT + 0.0001,
                'longitude' => self::FREE2_LNG,
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', FarmLocationService::CONFLICT_MESSAGE);

        // Farm A stayed where it was.
        $this->assertEqualsWithDelta(self::FREE_LNG, (float) $farmA->fresh()->longitude, 0.000001);
    }

    public function test_edit_moving_to_free_area_is_allowed(): void
    {
        $farmA = $this->makeFarm($this->makeOwner(), self::FREE_LAT, self::FREE_LNG, 'Farm A');

        $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$farmA->id}", [
                'latitude'  => self::FREE_LAT,
                'longitude' => self::FREE2_LNG,
            ])
            ->assertStatus(200);

        $this->assertEqualsWithDelta(self::FREE2_LNG, (float) $farmA->fresh()->longitude, 0.000001);
    }

    public function test_map_data_exposes_radius(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/admin/farms-map')
            ->assertStatus(200)
            ->assertJsonPath('duplicate_radius_meters', config('farms.duplicate_location_radius_meters'));
    }
}
