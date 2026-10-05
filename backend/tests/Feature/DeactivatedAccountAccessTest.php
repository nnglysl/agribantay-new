<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * A deactivated account must not be able to authenticate, and a token issued
 * before the deactivation must stop working on the very next request.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=DeactivatedAccountAccessTest
 */
class DeactivatedAccountAccessTest extends TestCase
{
    use DatabaseTransactions;

    private const PASSWORD = 'Str0ng!pass';

    private User $farmer;
    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=DeactivatedAccountAccessTest');
        }

        Http::fake();

        $this->farmer = User::create([
            'first_name'    => 'Deact',
            'last_name'     => Str::random(6),
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password'      => bcrypt(self::PASSWORD),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        $this->farm = Farm::create([
            'user_id'       => $this->farmer->id,
            'farm_name'     => 'Deactivation Test Farm',
            'owner_name'    => $this->farmer->full_name,
            'mobile_number' => $this->farmer->mobile_number,
            'barangay'      => 'Aya',
            'address'       => 'x',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    /**
     * Every request in one test method shares a single application instance,
     * so a guard that already resolved a user (via a previous token request or
     * actingAs()) keeps serving that cached model instead of re-reading the
     * row. Production has no such carry-over — each request boots fresh — so
     * the guards are flushed here to make a test request behave like a real
     * one.
     */
    private function freshRequest(): static
    {
        $this->app['auth']->forgetGuards();

        return $this;
    }

    private function login(string $password = self::PASSWORD)
    {
        return $this->freshRequest()->postJson('/api/login', [
            'login'    => $this->farmer->mobile_number,
            'password' => $password,
        ]);
    }

    public function test_active_farmer_logs_in_and_receives_a_token(): void
    {
        $this->login()
            ->assertOk()
            ->assertJsonPath('user.role', 'farm_owner')
            ->assertJsonStructure(['token']);
    }

    public function test_inactive_farmer_is_refused_with_the_deactivated_message_and_no_token(): void
    {
        $this->farmer->update(['status' => 'inactive']);

        $response = $this->login()->assertStatus(403);

        $this->assertStringContainsString('deactivated', $response->json('message'));
        $this->assertNull($response->json('token'));
        $this->assertSame(0, $this->farmer->tokens()->count());
    }

    public function test_inactive_farmer_with_a_wrong_password_still_gets_the_generic_401(): void
    {
        $this->farmer->update(['status' => 'inactive']);

        $this->login('not-the-password')
            ->assertStatus(401)
            ->assertJsonPath('message', 'Invalid credentials.');
    }

    public function test_token_issued_before_deactivation_stops_working_and_is_revoked(): void
    {
        $token = $this->login()->json('token');

        $this->freshRequest()->withToken($token)->getJson('/api/me')->assertOk();

        $this->farmer->update(['status' => 'inactive']);

        $this->freshRequest()->withToken($token)->getJson('/api/me')->assertStatus(401);
        $this->freshRequest()->withToken($token)->getJson('/api/farmer/dashboard')->assertStatus(401);

        $this->assertSame(0, $this->farmer->fresh()->tokens()->count());
    }

    public function test_reactivated_farmer_can_log_in_again(): void
    {
        $this->farmer->update(['status' => 'inactive']);
        $this->login()->assertStatus(403);

        $this->farmer->update(['status' => 'active']);
        $this->login()->assertOk();
    }

    /**
     * Farm status and account status are separate concerns: farms.status says
     * whether a farm is monitored, users.status says whether a person may sign
     * in. Deactivating a farm must not answer the second question — an earlier
     * version did, which locked out owners who still held other farms.
     */
    public function test_deactivating_a_farm_leaves_the_owner_account_alone(): void
    {
        $token = $this->login()->json('token');
        $superAdmin = User::where('role', 'super_admin')->firstOrFail();

        $this->freshRequest()->actingAs($superAdmin)
            ->patchJson("/api/admin/farms/{$this->farm->id}/deactivate")
            ->assertOk();

        $this->assertSame('active', $this->farmer->fresh()->status);
        $this->assertSame(1, $this->farmer->fresh()->tokens()->count(), 'the live session must survive');

        $this->freshRequest()->withToken($token)->getJson('/api/me')->assertOk();
        $this->login()->assertOk();
    }

    public function test_reactivating_a_farm_also_leaves_the_account_alone(): void
    {
        $superAdmin = User::where('role', 'super_admin')->firstOrFail();

        $this->freshRequest()->actingAs($superAdmin)->patchJson("/api/admin/farms/{$this->farm->id}/deactivate")->assertOk();
        $this->freshRequest()->actingAs($superAdmin)->patchJson("/api/admin/farms/{$this->farm->id}/activate")->assertOk();

        $this->assertSame('active', $this->farmer->fresh()->status);
        $this->login()->assertOk();
    }

    /**
     * An explicitly deactivated account is still refused — the fix this file
     * was written for. Only the trigger changed, not the enforcement.
     */
    public function test_an_explicitly_deactivated_owner_is_still_blocked(): void
    {
        $token = $this->login()->json('token');

        $this->farmer->update(['status' => 'inactive']);

        $this->login()->assertStatus(403);
        $this->freshRequest()->withToken($token)->getJson('/api/me')->assertStatus(401);
    }

    public function test_owner_with_a_second_active_farm_keeps_access(): void
    {
        $other = Farm::create([
            'user_id'       => $this->farmer->id,
            'farm_name'     => 'Second Farm',
            'owner_name'    => $this->farmer->full_name,
            'mobile_number' => $this->farmer->mobile_number,
            'barangay'      => 'Aya',
            'address'       => 'y',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);

        $superAdmin = User::where('role', 'super_admin')->firstOrFail();

        $this->freshRequest()->actingAs($superAdmin)->patchJson("/api/admin/farms/{$this->farm->id}/deactivate")->assertOk();

        $this->assertSame('active', $this->farmer->fresh()->status);
        $this->login()->assertOk();

        $other->delete();
    }
}
