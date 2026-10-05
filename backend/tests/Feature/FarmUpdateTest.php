<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Farm Management -> Farm Information -> Edit.
 *
 * The regression this guards: farms.owner_name is a denormalized copy of the
 * owner's name, written by store() and read back by the Farm Profile. update()
 * wrote the new name to users.first_name/last_name but left owner_name alone,
 * so the save reported success and the profile kept showing the old name.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmUpdateTest
 */
class FarmUpdateTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private Farm $farm;
    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmUpdateTest');
        }

        Http::fake();

        $this->admin = User::where('role', 'admin')->firstOrFail();

        $this->owner = User::create([
            'first_name'    => 'Original',
            'last_name'     => 'Owner',
            'mobile_number' => $this->freeMobile(),
            'password'      => bcrypt('x'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        $this->farm = Farm::create([
            'user_id'       => $this->owner->id,
            'farm_name'     => 'Original Farm Name',
            'owner_name'    => 'Original Owner',
            'mobile_number' => $this->owner->mobile_number,
            'barangay'      => 'Aya',
            'address'       => 'Aya, San Jose, Batangas, Philippines',
            'farm_size'     => 'Small',
            'status'        => 'Active',
            'latitude'      => 13.8577785,
            'longitude'     => 121.0934866,
        ]);
    }

    private function freeMobile(): string
    {
        do {
            $mobile = '09'.random_int(100000000, 999999999);
        } while (User::where('mobile_number', $mobile)->exists());

        return $mobile;
    }

    /** The payload the edit form sends, with overrides applied. */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'first_name'    => 'Original',
            'last_name'     => 'Owner',
            'mobile_number' => $this->owner->mobile_number,
            'farm_name'     => $this->farm->farm_name,
            'barangay'      => $this->farm->barangay,
            'farm_size'     => $this->farm->farm_size,
            'lot_number'    => '',
            'street'        => '',
            'landmark'      => '',
        ], $overrides);
    }

    private function update(array $overrides = [])
    {
        return $this->actingAs($this->admin)
            ->putJson("/api/admin/farms/{$this->farm->id}", $this->payload($overrides));
    }

    /** What the Farm Profile actually renders after a save. */
    private function profile(): array
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($this->admin)
            ->getJson("/api/admin/farms/{$this->farm->id}")
            ->assertOk()
            ->json('data');
    }

    public function test_owner_name_change_is_reflected_in_the_farm_profile(): void
    {
        $this->update(['first_name' => 'Juan', 'last_name' => 'Dela Cruz'])->assertOk();

        $fresh = $this->farm->fresh();

        // users row — this part always worked.
        $this->assertSame('Juan', $this->owner->fresh()->first_name);
        $this->assertSame('Dela Cruz', $this->owner->fresh()->last_name);

        // farms.owner_name — the copy the profile reads back. This is what
        // used to stay stale and make the save look like it did nothing.
        $this->assertSame('Juan Dela Cruz', $fresh->owner_name);
        $this->assertSame('Juan Dela Cruz', $this->profile()['owner_name']);
    }

    public function test_farm_fields_are_saved_and_survive_a_reload(): void
    {
        $this->update([
            'farm_name' => 'Renamed Farm',
            'farm_size' => 'Large',
            'landmark'  => 'Beside the chapel',
        ])->assertOk();

        $profile = $this->profile();

        $this->assertSame('Renamed Farm', $profile['farm_name']);
        $this->assertSame('Large', $profile['farm_size']);
        $this->assertSame('Beside the chapel', $profile['landmark']);
    }

    public function test_farm_and_owner_changes_are_saved_together(): void
    {
        $newMobile = $this->freeMobile();

        $this->update([
            'first_name'    => 'Maria',
            'last_name'     => 'Santos',
            'mobile_number' => $newMobile,
            'farm_name'     => 'Santos Poultry',
        ])->assertOk();

        $fresh   = $this->farm->fresh();
        $profile = $this->profile();

        $this->assertSame('Maria Santos', $fresh->owner_name);
        $this->assertSame($newMobile, $this->owner->fresh()->mobile_number);
        $this->assertSame($newMobile, $fresh->mobile_number);
        $this->assertSame('Santos Poultry', $profile['farm_name']);
        $this->assertSame('Maria Santos', $profile['owner_name']);
    }

    public function test_invalid_data_is_rejected_and_nothing_is_written(): void
    {
        $this->update(['farm_size' => 'Gigantic'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('farm_size');

        $this->assertSame('Original Farm Name', $this->farm->fresh()->farm_name);
        $this->assertSame('Small', $this->farm->fresh()->farm_size);
    }

    public function test_a_mobile_number_held_by_another_account_is_rejected(): void
    {
        $taken = User::create([
            'first_name'    => 'Taken',
            'last_name'     => Str::random(5),
            'mobile_number' => $this->freeMobile(),
            'password'      => bcrypt('x'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        $this->update(['mobile_number' => $taken->mobile_number])
            ->assertStatus(422)
            ->assertJsonValidationErrors('mobile_number');

        // The farm name in the same rejected payload must not have been saved.
        $this->assertSame($this->owner->mobile_number, $this->owner->fresh()->mobile_number);
    }

    public function test_a_rejected_owner_update_does_not_half_save_the_farm(): void
    {
        $taken = User::create([
            'first_name'    => 'Blocker',
            'last_name'     => Str::random(5),
            'mobile_number' => $this->freeMobile(),
            'password'      => bcrypt('x'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        $this->update([
            'farm_name'     => 'Should Not Persist',
            'mobile_number' => $taken->mobile_number,
        ])->assertStatus(422);

        $this->assertSame('Original Farm Name', $this->farm->fresh()->farm_name);
    }

    public function test_missing_farm_is_rejected(): void
    {
        $this->actingAs($this->admin)
            ->putJson('/api/admin/farms/99999999', $this->payload())
            ->assertStatus(404);
    }

    public function test_a_farm_owner_cannot_update_a_farm(): void
    {
        $this->actingAs($this->owner)
            ->putJson("/api/admin/farms/{$this->farm->id}", $this->payload(['farm_name' => 'Hijacked']))
            ->assertStatus(403);

        $this->assertSame('Original Farm Name', $this->farm->fresh()->farm_name);
    }

    public function test_a_vet_cannot_update_a_farm(): void
    {
        $vet = User::where('role', 'vet')->firstOrFail();

        $this->actingAs($vet)
            ->putJson("/api/admin/farms/{$this->farm->id}", $this->payload(['farm_name' => 'Hijacked']))
            ->assertStatus(403);

        $this->assertSame('Original Farm Name', $this->farm->fresh()->farm_name);
    }

    public function test_resaving_an_unchanged_form_still_succeeds(): void
    {
        $this->update()->assertOk();

        $this->assertSame('Original Farm Name', $this->farm->fresh()->farm_name);
        $this->assertSame('Original Owner', $this->farm->fresh()->owner_name);
    }
}
