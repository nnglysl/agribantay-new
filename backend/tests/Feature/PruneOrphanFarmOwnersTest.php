<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * farms:prune-orphan-owners — the one-off cleanup for owner accounts left
 * behind by farm deletions made before the owner lifecycle rule existed.
 *
 * The danger in a command like this is that it deletes one account too many,
 * so most of what is tested here is what it must NOT touch.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=PruneOrphanFarmOwnersTest
 */
class PruneOrphanFarmOwnersTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=PruneOrphanFarmOwnersTest');
        }

        Http::fake();
    }

    private function owner(string $role = 'farm_owner'): User
    {
        do {
            $mobile = '09'.random_int(100000000, 999999999);
        } while (User::where('mobile_number', $mobile)->exists());

        return User::create([
            'first_name'    => 'Prune',
            'last_name'     => Str::random(6),
            'mobile_number' => $mobile,
            'password'      => bcrypt('x'),
            'role'          => $role,
            'status'        => 'active',
        ]);
    }

    private function farmFor(User $owner, string $status = 'Active'): Farm
    {
        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => 'Prune Farm '.Str::random(4),
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Aya',
            'address'       => 'x',
            'farm_size'     => 'Small',
            'status'        => $status,
        ]);
    }

    public function test_a_dry_run_reports_but_deletes_nothing(): void
    {
        $orphan = $this->owner();

        $this->artisan('farms:prune-orphan-owners')->assertExitCode(0);

        $this->assertDatabaseHas('users', ['id' => $orphan->id]);
    }

    public function test_force_removes_an_owner_with_no_farm(): void
    {
        $orphan = $this->owner();

        $this->artisan('farms:prune-orphan-owners', ['--force' => true])->assertExitCode(0);

        $this->assertDatabaseMissing('users', ['id' => $orphan->id]);
    }

    public function test_an_owner_with_a_farm_is_never_touched(): void
    {
        $kept = $this->owner();
        $this->farmFor($kept);

        $this->artisan('farms:prune-orphan-owners', ['--force' => true])->assertExitCode(0);

        $this->assertDatabaseHas('users', ['id' => $kept->id]);
    }

    /**
     * A farm that is merely deactivated is still a farm — its owner is not an
     * orphan and must survive, which is the same rule the delete path uses.
     */
    public function test_an_owner_whose_only_farm_is_deactivated_is_kept(): void
    {
        $kept = $this->owner();
        $this->farmFor($kept, 'Deactivated');

        $this->artisan('farms:prune-orphan-owners', ['--force' => true])->assertExitCode(0);

        $this->assertDatabaseHas('users', ['id' => $kept->id]);
    }

    public function test_admins_vets_and_super_admins_are_never_touched(): void
    {
        // None of these own farms, so a role-blind version of this command
        // would delete every one of them.
        $before = User::whereIn('role', ['admin', 'vet', 'super_admin'])->pluck('id');

        $this->artisan('farms:prune-orphan-owners', ['--force' => true])->assertExitCode(0);

        foreach ($before as $id) {
            $this->assertDatabaseHas('users', ['id' => $id]);
        }
    }

    public function test_it_removes_only_the_orphans_in_a_mixed_set(): void
    {
        $orphanA = $this->owner();
        $orphanB = $this->owner();
        $kept    = $this->owner();
        $this->farmFor($kept);

        $this->artisan('farms:prune-orphan-owners', ['--force' => true])->assertExitCode(0);

        $this->assertDatabaseMissing('users', ['id' => $orphanA->id]);
        $this->assertDatabaseMissing('users', ['id' => $orphanB->id]);
        $this->assertDatabaseHas('users', ['id' => $kept->id]);
    }

    public function test_running_it_twice_is_safe(): void
    {
        $this->owner();

        $this->artisan('farms:prune-orphan-owners', ['--force' => true])->assertExitCode(0);
        $this->artisan('farms:prune-orphan-owners', ['--force' => true])->assertExitCode(0);
    }

    public function test_a_pruned_owner_can_no_longer_log_in(): void
    {
        $orphan = $this->owner();
        $orphan->update(['password' => bcrypt('Kn0wn!pass')]);

        $this->artisan('farms:prune-orphan-owners', ['--force' => true])->assertExitCode(0);

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/login', [
            'login'    => $orphan->mobile_number,
            'password' => 'Kn0wn!pass',
        ])->assertStatus(401);
    }
}
