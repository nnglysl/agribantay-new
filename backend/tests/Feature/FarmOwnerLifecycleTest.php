<?php

namespace Tests\Feature;

use App\Mail\OtpCodeMail;
use App\Models\Farm;
use App\Models\SensorReading;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The Farm Owner account lifecycle around permanent farm deletion.
 *
 * The rule under test: an owner account exists for exactly as long as the
 * owner has at least one farm. After a farm is permanently deleted, the
 * REMAINING FARM COUNT decides — never the status of the farm that was
 * deleted, and never the fact that a deletion happened.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmOwnerLifecycleTest
 */
class FarmOwnerLifecycleTest extends TestCase
{
    use DatabaseTransactions;

    private const OWNER_PASSWORD = 'Own3r!pass';

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmOwnerLifecycleTest');
        }

        Mail::fake();
        Http::fake();

        $this->superAdmin = User::where('role', 'super_admin')->whereNotNull('email')->firstOrFail();
    }

    private function owner(): User
    {
        do {
            $mobile = '09'.random_int(100000000, 999999999);
        } while (User::where('mobile_number', $mobile)->exists());

        return User::create([
            'first_name'    => 'Juan',
            'last_name'     => 'Dela '.Str::random(5),
            'mobile_number' => $mobile,
            'password'      => bcrypt(self::OWNER_PASSWORD),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);
    }

    private function farmFor(User $owner, string $status = 'Deactivated'): Farm
    {
        $farm = Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => 'Farm '.Str::random(5),
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Calansayan',
            'address'       => 'Test',
            'farm_size'     => 'Small',
            'status'        => $status,
            'latitude'      => 13.8550,
            'longitude'     => 121.0930,
        ]);

        SensorReading::create([
            'farm_id' => $farm->id, 'ammonia' => 10, 'temperature' => 30, 'humidity' => 60, 'moisture' => 40,
            'ammonia_status' => 'Safe', 'temperature_status' => 'Safe',
            'humidity_status' => 'Safe', 'moisture_status' => 'Safe',
        ]);

        return $farm;
    }

    /** Runs the real OTP flow, reading the code out of the faked email. */
    private function deleteFarm(Farm $farm)
    {
        $this->app['auth']->forgetGuards();

        $this->actingAs($this->superAdmin)
            ->postJson("/api/superadmin/farms/{$farm->id}/delete/otp/request")
            ->assertOk();

        $code = null;
        Mail::assertSent(OtpCodeMail::class, function (OtpCodeMail $mail) use (&$code) {
            $code = $mail->code;
            return $mail->purpose === 'farm_deletion';
        });

        return $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => $code]);
    }

    private function login(User $owner, string $password = self::OWNER_PASSWORD)
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson('/api/login', [
            'login'    => $owner->mobile_number,
            'password' => $password,
        ]);
    }

    // ------------------------------------------- Owner keeps other farms

    public function test_owner_with_three_farms_keeps_account_when_one_is_deleted(): void
    {
        $owner = $this->owner();
        $farmA = $this->farmFor($owner);
        $farmB = $this->farmFor($owner, 'Active');
        $farmC = $this->farmFor($owner, 'Active');

        $this->deleteFarm($farmA)
            ->assertOk()
            ->assertJsonPath('owner_deleted', false);

        $this->assertDatabaseMissing('farms', ['id' => $farmA->id]);
        $this->assertDatabaseHas('farms', ['id' => $farmB->id]);
        $this->assertDatabaseHas('farms', ['id' => $farmC->id]);
        $this->assertDatabaseHas('users', ['id' => $owner->id]);
        $this->assertSame('active', $owner->fresh()->status);
    }

    public function test_remaining_farms_keep_their_own_data(): void
    {
        $owner = $this->owner();
        $farmA = $this->farmFor($owner);
        $farmB = $this->farmFor($owner, 'Active');

        $this->deleteFarm($farmA)->assertOk();

        // Farm B's readings must be untouched by Farm A's cleanup.
        $this->assertDatabaseHas('sensor_readings', ['farm_id' => $farmB->id]);
        $this->assertDatabaseMissing('sensor_readings', ['farm_id' => $farmA->id]);
    }

    public function test_owner_can_still_log_in_and_sees_only_remaining_farms(): void
    {
        $owner = $this->owner();
        $farmA = $this->farmFor($owner);
        $farmB = $this->farmFor($owner, 'Active');

        $this->deleteFarm($farmA)->assertOk();

        $token = $this->login($owner)->assertOk()->json('token');

        $this->app['auth']->forgetGuards();
        $farms = $this->withToken($token)->getJson('/api/farmer/farms')->assertOk()->json('data');

        $ids = collect($farms)->pluck('id')->all();
        $this->assertContains($farmB->id, $ids);
        $this->assertNotContains($farmA->id, $ids);
    }

    /**
     * A Deactivated farm is still a farm. An owner holding one must survive
     * the deletion of another — the count is what matters, not the status.
     */
    public function test_a_remaining_deactivated_farm_still_saves_the_account(): void
    {
        $owner = $this->owner();
        $farmA = $this->farmFor($owner);
        $farmB = $this->farmFor($owner);

        $this->deleteFarm($farmA)->assertOk()->assertJsonPath('owner_deleted', false);

        $this->assertDatabaseHas('users', ['id' => $owner->id]);
        $this->login($owner)->assertOk();
    }

    // -------------------------------------------- Last farm takes the account

    public function test_deleting_the_only_farm_deletes_the_owner_account(): void
    {
        $owner = $this->owner();
        $farm  = $this->farmFor($owner);

        $this->deleteFarm($farm)
            ->assertOk()
            ->assertJsonPath('owner_deleted', true);

        $this->assertDatabaseMissing('farms', ['id' => $farm->id]);
        $this->assertDatabaseMissing('users', ['id' => $owner->id]);
    }

    public function test_deleting_the_last_of_several_farms_deletes_the_owner(): void
    {
        $owner = $this->owner();
        $farmA = $this->farmFor($owner);
        $farmB = $this->farmFor($owner);

        $this->deleteFarm($farmA)->assertOk()->assertJsonPath('owner_deleted', false);
        $this->assertDatabaseHas('users', ['id' => $owner->id]);

        $this->deleteFarm($farmB)->assertOk()->assertJsonPath('owner_deleted', true);
        $this->assertDatabaseMissing('users', ['id' => $owner->id]);
    }

    public function test_a_live_session_stops_working_once_the_account_is_deleted(): void
    {
        $owner = $this->owner();
        $farm  = $this->farmFor($owner);

        $token = $this->login($owner)->assertOk()->json('token');

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertOk();

        $this->deleteFarm($farm)->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertStatus(401);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/farmer/farms')->assertStatus(401);

        $this->assertSame(0, \Laravel\Sanctum\PersonalAccessToken::where('tokenable_id', $owner->id)
            ->where('tokenable_type', User::class)->count(), 'tokens were left behind');
    }

    public function test_deleted_owner_cannot_log_in_again(): void
    {
        $owner = $this->owner();
        $farm  = $this->farmFor($owner);

        $this->deleteFarm($farm)->assertOk();

        $response = $this->login($owner)->assertStatus(401);

        $this->assertNull($response->json('token'));
    }

    // ---------------------------------------------------------- OTP guard

    public function test_a_wrong_code_cancels_everything(): void
    {
        $owner = $this->owner();
        $farm  = $this->farmFor($owner);

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->superAdmin)
            ->postJson("/api/superadmin/farms/{$farm->id}/delete/otp/request")
            ->assertOk();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => '000000'])
            ->assertStatus(422);

        // Neither the farm nor the owner may be touched by a failed attempt.
        $this->assertDatabaseHas('farms', ['id' => $farm->id]);
        $this->assertDatabaseHas('users', ['id' => $owner->id]);
        $this->assertTrue(Hash::check(self::OWNER_PASSWORD, $owner->fresh()->password));
    }

    // ------------------------------------------------- Dialog data source

    public function test_farm_list_reports_the_owners_farm_count(): void
    {
        $solo  = $this->owner();
        $this->farmFor($solo, 'Active');

        $multi = $this->owner();
        $this->farmFor($multi, 'Active');
        $this->farmFor($multi, 'Active');

        $this->app['auth']->forgetGuards();
        $rows = collect($this->actingAs($this->superAdmin)->getJson('/api/admin/farms')->assertOk()->json('data'));

        $soloRow  = $rows->firstWhere('owner_name', $solo->full_name);
        $multiRow = $rows->firstWhere('owner_name', $multi->full_name);

        $this->assertSame(1, $soloRow['owner_farm_count']);
        $this->assertSame(2, $multiRow['owner_farm_count']);
    }

    // ------------------------------------------- Never delete the wrong user

    public function test_an_admin_account_is_never_deleted_by_farm_deletion(): void
    {
        // A farm pointed at a non-farm_owner account must never take that
        // account with it, whatever the remaining count says.
        $staff = User::where('role', 'admin')->firstOrFail();
        $farm  = Farm::create([
            'user_id'       => $staff->id,
            'farm_name'     => 'Misattributed '.Str::random(4),
            'owner_name'    => $staff->full_name,
            'mobile_number' => $staff->mobile_number,
            'barangay'      => 'Calansayan',
            'address'       => 'Test',
            'farm_size'     => 'Small',
            'status'        => 'Deactivated',
            'latitude'      => 13.8550,
            'longitude'     => 121.0930,
        ]);

        $this->deleteFarm($farm)->assertOk()->assertJsonPath('owner_deleted', false);

        $this->assertDatabaseHas('users', ['id' => $staff->id]);
    }
}
