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
 * San Jose boundary + barangay rules (FarmLocationService) as enforced by
 * POST/PUT /api/admin/farms and the live check endpoint, and the guard that
 * keeps the backend's geography data identical to the frontend's copies.
 *
 * Same MySQL-only caveat as FarmLocationConflictTest; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmGeographyTest
 */
class FarmGeographyTest extends TestCase
{
    use DatabaseTransactions;

    // Inside the OSM boundary polygon of the named barangay, away from every
    // seeded farm.
    private const CALANSAYAN = [13.8550, 121.0930];
    private const AYA        = [13.8900, 121.1150];

    // Reference-point-only barangay (no OSM polygon): a spot ~430 m from the
    // Pinagtung-ulan place node.
    private const PINAGTUNG_ULAN = [13.9260, 121.0900];

    private const MANILA = [14.5995, 120.9842];
    private const CEBU   = [10.3157, 123.8854];
    private const LONDON = [51.5074, -0.1278];

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmGeographyTest');
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

    private function makeFarm(User $owner, array $pin, string $barangay, string $name = 'Existing Farm'): Farm
    {
        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => $name,
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => $barangay,
            'address'       => 'Test',
            'farm_size'     => 'Small',
            'status'        => 'Active',
            'latitude'      => $pin[0],
            'longitude'     => $pin[1],
        ]);
    }

    private function payload(User $owner, array $pin, string $barangay, array $extra = []): array
    {
        return array_merge([
            'farm_owner_id' => $owner->id,
            'farm_name'     => 'New Farm',
            'farm_size'     => 'Small',
            'barangay'      => $barangay,
            'lot_number'    => 'Lot 4',
            'street'        => 'Purok 2',
            'landmark'      => 'Chapel',
            'latitude'      => $pin[0],
            'longitude'     => $pin[1],
        ], $extra);
    }

    // ---------------------------------------------------------------------
    // Data consistency
    // ---------------------------------------------------------------------

    public function test_backend_boundary_matches_frontend_polygon(): void
    {
        $js = file_get_contents(base_path('../frontend/src/constants/sanJoseBoundary.js'));
        $this->assertNotFalse($js, 'frontend/src/constants/sanJoseBoundary.js not found');

        preg_match('/SAN_JOSE_BOUNDARY = \[(.*?)\n\]/s', $js, $m);
        preg_match_all('/\[\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\]/', $m[1] ?? '', $pts, PREG_SET_ORDER);
        $frontend = array_map(fn ($p) => [(float) $p[1], (float) $p[2]], $pts);

        $backend = array_map(fn ($p) => [(float) $p[0], (float) $p[1]], config('geography.municipality.boundary'));

        $this->assertGreaterThan(100, count($frontend));
        $this->assertSame($frontend, $backend, 'config/geography.php municipality boundary differs from sanJoseBoundary.js');
    }

    public function test_backend_barangay_list_matches_frontend_dropdown(): void
    {
        $js = file_get_contents(base_path('../frontend/src/constants/barangays.js'));
        $this->assertNotFalse($js, 'frontend/src/constants/barangays.js not found');

        preg_match_all("/'([^']+)'/", $js, $m);
        $frontend = $m[1];

        $this->assertCount(33, $frontend);
        $this->assertSame($frontend, app(FarmLocationService::class)->officialBarangays());
    }

    public function test_every_polygon_barangay_contains_its_own_center(): void
    {
        $service = app(FarmLocationService::class);
        foreach (config('geography.barangays') as $name => $entry) {
            $this->assertTrue($service->isInsideSanJose($entry['center'][0], $entry['center'][1]), "$name center is outside San Jose");
            if (!empty($entry['polygon'])) {
                $this->assertTrue($service->pointInPolygon($entry['center'][0], $entry['center'][1], $entry['polygon']), "$name center is outside its own polygon");
            }
        }
    }

    // ---------------------------------------------------------------------
    // Service verdicts
    // ---------------------------------------------------------------------

    public function test_service_verdicts(): void
    {
        $s = app(FarmLocationService::class);

        $this->assertSame('outside', $s->validate(...self::MANILA, barangay: 'Calansayan')['status']);
        $this->assertSame('outside', $s->validate(...self::CEBU, barangay: 'Calansayan')['status']);
        $this->assertSame('outside', $s->validate(...self::LONDON, barangay: 'Calansayan')['status']);

        $this->assertSame('invalid_barangay', $s->validate(...self::CALANSAYAN, barangay: 'Fakebrgy')['status']);

        $verified = $s->validate(...self::CALANSAYAN, barangay: 'Calansayan');
        $this->assertSame('verified', $verified['status']);
        $this->assertTrue($verified['ok']);
        $this->assertSame('Calansayan', $verified['detected_barangay']);

        // Inside San Jose, but the pin is inside Aya's boundary.
        $mismatch = $s->validate(...self::AYA, barangay: 'Calansayan');
        $this->assertSame('mismatch', $mismatch['status']);
        $this->assertFalse($mismatch['ok']);
        $this->assertSame('Aya', $mismatch['detected_barangay']);
        $this->assertSame(FarmLocationService::MISMATCH_MESSAGE, $mismatch['message']);

        // No polygon for Pinagtung-ulan: near its reference point is
        // "unverified" (allowed, flagged) — never claimed as a match.
        $unverified = $s->validate(...self::PINAGTUNG_ULAN, barangay: 'Pinagtung-Ulan');
        $this->assertSame('unverified', $unverified['status']);
        $this->assertTrue($unverified['ok']);

        // …while a pin ~6 km south of that point clearly isn't there.
        $this->assertSame('mismatch', $s->validate(...self::CALANSAYAN, barangay: 'Pinagtung-Ulan')['status']);
    }

    // ---------------------------------------------------------------------
    // Store — Register Farm Owner / Add to Existing Owner both post here
    // ---------------------------------------------------------------------

    public function test_valid_location_with_matching_barangay_saves(): void
    {
        $owner = $this->makeOwner();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->payload($owner, self::CALANSAYAN, 'Calansayan'))
            ->assertStatus(200)
            ->assertJsonPath('location.status', 'verified');

        $this->assertDatabaseHas('farms', [
            'farm_name' => 'New Farm', 'user_id' => $owner->id, 'barangay' => 'Calansayan',
            'lot_number' => 'Lot 4', 'street' => 'Purok 2', 'landmark' => 'Chapel',
        ]);
    }

    public function test_reference_point_barangay_saves_as_unverified(): void
    {
        $owner = $this->makeOwner();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->payload($owner, self::PINAGTUNG_ULAN, 'Pinagtung-Ulan'))
            ->assertStatus(200)
            ->assertJsonPath('location.status', 'unverified');
    }

    public function test_pin_outside_san_jose_is_rejected(): void
    {
        $owner = $this->makeOwner();

        foreach ([self::MANILA, self::CEBU, self::LONDON] as $pin) {
            $this->actingAs($this->admin)
                ->postJson('/api/admin/farms', $this->payload($owner, $pin, 'Calansayan'))
                ->assertStatus(422)
                ->assertJsonPath('message', FarmLocationService::OUTSIDE_MESSAGE)
                ->assertJsonPath('errors.location.0', FarmLocationService::OUTSIDE_MESSAGE);
        }

        $this->assertDatabaseMissing('farms', ['farm_name' => 'New Farm']);
    }

    public function test_pin_in_another_barangay_is_rejected(): void
    {
        $owner = $this->makeOwner();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->payload($owner, self::AYA, 'Calansayan'))
            ->assertStatus(422)
            ->assertJsonPath('message', FarmLocationService::MISMATCH_MESSAGE);

        $this->assertDatabaseMissing('farms', ['farm_name' => 'New Farm']);
    }

    public function test_fake_barangay_is_rejected(): void
    {
        $owner = $this->makeOwner();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->payload($owner, self::CALANSAYAN, 'Fakebrgy'))
            ->assertStatus(422)
            ->assertJsonPath('errors.barangay.0', FarmLocationService::INVALID_BARANGAY_MESSAGE);

        $this->assertDatabaseMissing('farms', ['farm_name' => 'New Farm']);
    }

    public function test_non_numeric_or_out_of_range_coordinates_are_rejected(): void
    {
        $owner = $this->makeOwner();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->payload($owner, ['abc', 'def'], 'Calansayan'))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['latitude', 'longitude']);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->payload($owner, [95, 200], 'Calansayan'))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['latitude', 'longitude']);
    }

    public function test_duplicate_area_is_still_rejected_after_geography_checks(): void
    {
        $owner = $this->makeOwner();
        $this->makeFarm($this->makeOwner(), self::CALANSAYAN, 'Calansayan');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->payload($owner, [self::CALANSAYAN[0] + 0.00018, self::CALANSAYAN[1]], 'Calansayan'))
            ->assertStatus(422)
            ->assertJsonPath('message', FarmLocationService::CONFLICT_MESSAGE);
    }

    public function test_invalid_location_never_creates_an_owner_account(): void
    {
        $mobile = '09' . random_int(100000000, 999999999);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', [
                'first_name'    => 'Stray',
                'last_name'     => 'Owner',
                'mobile_number' => $mobile,
                'farm_name'     => 'New Farm',
                'farm_size'     => 'Small',
                'barangay'      => 'Calansayan',
                'latitude'      => self::MANILA[0],
                'longitude'     => self::MANILA[1],
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', FarmLocationService::OUTSIDE_MESSAGE);

        $this->assertDatabaseMissing('users', ['mobile_number' => $mobile]);
        $this->assertDatabaseMissing('farms', ['farm_name' => 'New Farm']);
    }

    public function test_invalid_location_leaves_existing_owner_untouched(): void
    {
        $owner = $this->makeOwner();
        $before = $owner->fresh()->toArray();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms', $this->payload($owner, self::AYA, 'Calansayan'))
            ->assertStatus(422);

        $this->assertSame($before, $owner->fresh()->toArray());
        $this->assertSame(0, Farm::where('user_id', $owner->id)->count());
    }

    // ---------------------------------------------------------------------
    // Update — Edit Farm
    // ---------------------------------------------------------------------

    public function test_edit_without_changing_location_still_saves_even_for_legacy_pins(): void
    {
        // A farm registered before these rules whose pin doesn't match its
        // barangay today. Editing unrelated fields must keep working.
        $farm = $this->makeFarm($this->makeOwner(), self::AYA, 'Calansayan', 'Legacy Farm');

        $this->actingAs($this->admin)
            ->post("/api/admin/farms/{$farm->id}", [
                '_method'   => 'PUT',
                'farm_name' => 'Legacy Farm renamed',
                'barangay'  => 'Calansayan',
                'farm_size' => 'Medium',
                'landmark'  => 'New landmark',
                'latitude'  => self::AYA[0],
                'longitude' => self::AYA[1],
            ], ['Accept' => 'application/json'])
            ->assertStatus(200);

        $this->assertDatabaseHas('farms', ['id' => $farm->id, 'farm_name' => 'Legacy Farm renamed', 'farm_size' => 'Medium']);
    }

    public function test_edit_dragging_pin_to_valid_location_saves(): void
    {
        $farm = $this->makeFarm($this->makeOwner(), self::CALANSAYAN, 'Calansayan');
        $target = [self::CALANSAYAN[0] + 0.002, self::CALANSAYAN[1] + 0.002];

        $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$farm->id}", ['latitude' => $target[0], 'longitude' => $target[1]])
            ->assertStatus(200)
            ->assertJsonPath('location.status', 'verified');

        $this->assertEqualsWithDelta($target[1], (float) $farm->fresh()->longitude, 0.000001);
    }

    public function test_edit_dragging_pin_outside_san_jose_is_rejected(): void
    {
        $farm = $this->makeFarm($this->makeOwner(), self::CALANSAYAN, 'Calansayan');

        $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$farm->id}", ['latitude' => self::MANILA[0], 'longitude' => self::MANILA[1]])
            ->assertStatus(422)
            ->assertJsonPath('message', FarmLocationService::OUTSIDE_MESSAGE);

        $this->assertEqualsWithDelta(self::CALANSAYAN[1], (float) $farm->fresh()->longitude, 0.000001);
    }

    public function test_edit_dragging_pin_into_another_barangay_is_rejected(): void
    {
        $farm = $this->makeFarm($this->makeOwner(), self::CALANSAYAN, 'Calansayan');

        $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$farm->id}", ['latitude' => self::AYA[0], 'longitude' => self::AYA[1]])
            ->assertStatus(422)
            ->assertJsonPath('message', FarmLocationService::MISMATCH_MESSAGE);

        $this->assertEqualsWithDelta(self::CALANSAYAN[1], (float) $farm->fresh()->longitude, 0.000001);
    }

    public function test_edit_changing_barangay_without_moving_pin_is_rejected_on_mismatch(): void
    {
        $farm = $this->makeFarm($this->makeOwner(), self::CALANSAYAN, 'Calansayan');

        // The edit form re-sends the (unchanged) pin alongside the new barangay.
        $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$farm->id}", [
                'barangay'  => 'Aya',
                'latitude'  => self::CALANSAYAN[0],
                'longitude' => self::CALANSAYAN[1],
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', FarmLocationService::MISMATCH_MESSAGE);

        $this->assertSame('Calansayan', $farm->fresh()->barangay);
    }

    public function test_edit_with_fake_barangay_is_rejected(): void
    {
        $farm = $this->makeFarm($this->makeOwner(), self::CALANSAYAN, 'Calansayan');

        $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$farm->id}", ['barangay' => 'Fakebrgy'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['barangay']);
    }

    // ---------------------------------------------------------------------
    // Live check endpoint used by the Location Preview
    // ---------------------------------------------------------------------

    public function test_check_location_endpoint_reports_verdicts_without_writing(): void
    {
        $farmsBefore = Farm::count();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms/check-location', ['latitude' => self::AYA[0], 'longitude' => self::AYA[1], 'barangay' => 'Calansayan'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'mismatch')
            ->assertJsonPath('data.ok', false)
            ->assertJsonPath('data.detected_barangay', 'Aya');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms/check-location', ['latitude' => self::MANILA[0], 'longitude' => self::MANILA[1], 'barangay' => 'Calansayan'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'outside');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms/check-location', ['latitude' => self::CALANSAYAN[0], 'longitude' => self::CALANSAYAN[1], 'barangay' => 'Fakebrgy'])
            ->assertStatus(422);

        // The farm being edited must not count against itself.
        $farm = $this->makeFarm($this->makeOwner(), self::CALANSAYAN, 'Calansayan');
        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms/check-location', ['latitude' => self::CALANSAYAN[0], 'longitude' => self::CALANSAYAN[1], 'barangay' => 'Calansayan'])
            ->assertJsonPath('data.status', 'conflict');
        $this->actingAs($this->admin)
            ->postJson('/api/admin/farms/check-location', ['latitude' => self::CALANSAYAN[0], 'longitude' => self::CALANSAYAN[1], 'barangay' => 'Calansayan', 'exclude_farm_id' => $farm->id])
            ->assertJsonPath('data.status', 'verified');

        $this->assertSame($farmsBefore + 1, Farm::count());
    }
}
