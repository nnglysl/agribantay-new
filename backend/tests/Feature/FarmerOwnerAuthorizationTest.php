<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\FarmOwnerController;
use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Support\PhaseOneCorrectionTestCase;
use Tests\Support\RegistrationDatabase;

class FarmerOwnerAuthorizationTest extends PhaseOneCorrectionTestCase
{
    private User $staff;

    private User $vet;

    private User $otherOwner;

    private Farm $otherFarm;

    protected function setUp(): void
    {
        parent::setUp();
        // Extend only the private in-memory fixture schema for real login,
        // profile and authorized owner-registration requests.
        Schema::table('users', function (Blueprint $t) {
            $t->string('address')->nullable();
            $t->string('profile_photo_path')->nullable();
            $t->boolean('must_change_password')->default(false);
            $t->timestamp('legal_acknowledged_at')->nullable();
            $t->string('remember_token')->nullable();
        });
        Schema::table('personal_access_tokens', function (Blueprint $t) {
            $t->string('name');
            $t->string('token', 64)->unique();
            $t->text('abilities')->nullable();
            $t->timestamp('last_used_at')->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->timestamps();
        });
        Schema::table('service_requests', fn (Blueprint $t) => $t->timestamps());
        RegistrationDatabase::fields();
        $this->staff = $this->user('admin');
        $this->vet = $this->user('vet');
        $this->otherOwner = $this->user('farm_owner');
        $this->otherFarm = Farm::create(['user_id' => $this->otherOwner->id, 'farm_name' => 'Private other-owner farm',
            'owner_name' => $this->otherOwner->full_name, 'mobile_number' => $this->otherOwner->mobile_number]);
    }

    private function registration(string $suffix = 'blocked'): array
    {
        $offset = in_array($suffix, ['super_admin', 'mobile-1'], true) ? 0.002 : 0;

        return ['first_name' => 'New', 'last_name' => 'Owner', 'mobile_number' => '09900000001',
            'email' => 'new-owner-'.$suffix.'@example.test', 'address' => 'Fixture owner address',
            'farms' => [['farm_name' => 'Authorized owner farm', 'farm_size' => 'Small', 'barangay' => 'Calansayan',
                'latitude' => 13.855 + $offset, 'longitude' => 121.093]]];
    }

    public function test_farmer_owner_aliases_are_removed_and_admin_actions_are_forbidden(): void
    {
        $users = User::count();
        $logs = ActivityLog::count();
        $this->actingAs($this->owner, 'sanctum');
        $this->getJson('/api/farmer/farm-owners?search=Private')->assertNotFound();
        $this->postJson('/api/farmer/farm-owners', $this->registration())->assertNotFound();
        $this->getJson('/api/admin/farm-owners')->assertForbidden();
        $this->postJson('/api/admin/farm-owners', $this->registration())->assertForbidden();
        $this->assertSame($users, User::count());
        $this->assertSame($logs, ActivityLog::count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_direct_requests_cannot_spoof_role_or_owner_identity(): void
    {
        $users = User::count();
        $this->actingAs($this->owner, 'sanctum')->withHeaders(['X-Role' => 'super_admin']);
        $this->getJson('/api/admin/farm-owners?role=super_admin&user_id='.$this->admin->id)->assertForbidden();
        $this->postJson('/api/admin/farm-owners', $this->registration() + [
            'role' => 'admin', 'user_id' => $this->admin->id, 'farm_id' => $this->otherFarm->id,
        ])->assertForbidden();
        $this->assertSame($users, User::count());
        $this->assertSame('farm_owner', $this->owner->fresh()->role);
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_controller_actions_remain_protected_if_an_alias_omits_role_middleware(): void
    {
        // A test-only in-memory alias verifies the action-level safeguard.
        Route::get('/api/_phase2-probe/owners', [FarmOwnerController::class, 'index'])
            ->middleware(['auth:sanctum', 'active']);
        Route::post('/api/_phase2-probe/owners', [FarmOwnerController::class, 'store'])
            ->middleware(['auth:sanctum', 'active']);
        $users = User::count();
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/_phase2-probe/owners')->assertForbidden();
        $this->postJson('/api/_phase2-probe/owners', [])->assertForbidden();
        $this->assertSame($users, User::count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_staff_and_super_admin_keep_owner_search_and_require_registration_house_counts(): void
    {
        $users = User::count();
        $farms = Farm::count();
        foreach ([$this->staff, $this->admin] as $actor) {
            $this->actingAs($actor, 'sanctum')->getJson('/api/admin/farm-owners?search='.$this->owner->email)
                ->assertOk()->assertJsonPath('data.0.id', $this->owner->id)->assertJsonPath('data.0.farm_count', 2);
            $payload = $this->registration($actor->role);
            $payload['mobile_number'] = $actor->role === 'admin' ? '09900000001' : '09900000002';
            $this->postJson('/api/admin/farm-owners', $payload + ['role' => 'super_admin'])->assertUnprocessable()
                ->assertJsonValidationErrors('farms.0.house_count');
        }
        // Successful native registration/delivery is exercised by DummyFarmInitializationTest.
        $this->assertSame($users, User::count());
        $this->assertSame($farms, Farm::count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_other_roles_and_unauthenticated_clients_cannot_manage_owners(): void
    {
        $this->actingAs($this->vet, 'sanctum')->getJson('/api/admin/farm-owners')->assertForbidden();
        $this->postJson('/api/admin/farm-owners', $this->registration())->assertForbidden();
        Auth::forgetGuards();
        $this->getJson('/api/admin/farm-owners')->assertUnauthorized();
        $this->postJson('/api/admin/farm-owners', $this->registration())->assertUnauthorized();
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_authorized_mobile_registration_without_house_counts_sends_no_sms(): void
    {
        $users = User::count();
        foreach ([$this->staff, $this->admin] as $i => $actor) {
            $payload = $this->registration('mobile-'.$i);
            unset($payload['email']);
            $payload['mobile_number'] = $i === 0 ? '09910000001' : '09910000002';
            $this->actingAs($actor, 'sanctum')->postJson('/api/admin/farm-owners', $payload)->assertUnprocessable()
                ->assertJsonValidationErrors('farms.0.house_count');
        }
        $this->assertSame($users, User::count());
        $this->assertSame(0, SmsLog::where('type', 'Account Creation')->where('status', 'Sent')->count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_deactivated_staff_and_super_admin_are_still_stopped_by_the_active_account_middleware(): void
    {
        $users = User::count();
        foreach ([$this->staff, $this->admin] as $actor) {
            // Simulate an out-of-band inactive row in this private in-memory
            // fixture. Ordinary Super Admin model updates are now protected.
            DB::table('users')->where('id', $actor->id)->update(['status' => 'inactive']);
            $this->actingAs($actor->fresh(), 'sanctum')->getJson('/api/admin/farm-owners')->assertUnauthorized();
            $this->postJson('/api/admin/farm-owners', $this->registration())->assertUnauthorized();
        }
        $this->assertSame($users, User::count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_all_legitimately_owned_farms_and_record_endpoints_remain_accessible(): void
    {
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/farmer/farms?user_id='.$this->otherOwner->id)
            ->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.id', $this->a->id)->assertJsonPath('data.1.id', $this->b->id);
        foreach ([$this->a, $this->b] as $farm) {
            $this->getJson('/api/farmer/dashboard?farm_id='.$farm->id)->assertOk()->assertJsonPath('data.farm_id', $farm->id);
            foreach (['inspections', 'service-requests', 'readings-history', 'maintenance', 'disposal-records', 'insights'] as $endpoint) {
                $this->getJson('/api/farmer/'.$endpoint.'?farm_id='.$farm->id)->assertOk();
            }
        }
    }

    public function test_foreign_farm_reads_and_writes_are_rejected_before_access_or_side_effects(): void
    {
        $this->actingAs($this->owner, 'sanctum');
        foreach (['dashboard', 'inspections', 'service-requests', 'readings-history', 'maintenance', 'disposal-records', 'insights'] as $endpoint) {
            $this->getJson('/api/farmer/'.$endpoint.'?farm_id='.$this->otherFarm->id)->assertNotFound();
        }
        foreach (['service-requests', 'maintenance', 'disposal-records'] as $endpoint) {
            $this->postJson('/api/farmer/'.$endpoint, ['farm_id' => $this->otherFarm->id, 'user_id' => $this->owner->id])->assertNotFound();
        }
        $this->getJson('/api/admin/farms/'.$this->otherFarm->id)->assertForbidden();
        foreach (['service_requests', 'maintenance_logs', 'manure_disposal_records'] as $table) {
            $this->assertSame(0, DB::table($table)->count());
        }
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_farmer_profile_access_and_updates_remain_scoped_to_the_authenticated_user(): void
    {
        $other = $this->otherOwner->fresh()->getAttributes();
        $count = User::count();
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/settings?user_id='.$this->otherOwner->id)
            ->assertOk()->assertJsonPath('data.email', $this->owner->email)->assertJsonPath('data.role', 'farm_owner');
        $this->putJson('/api/settings/profile', ['first_name' => 'Updated', 'last_name' => 'Self',
            'mobile_number' => $this->owner->mobile_number, 'role' => 'super_admin', 'user_id' => $this->otherOwner->id])
            ->assertOk()->assertJsonPath('data.id', $this->owner->id)->assertJsonPath('data.role', 'farm_owner');
        $this->assertSame($other, $this->otherOwner->fresh()->getAttributes());
        $this->assertSame($count, User::count());
        $this->assertSame([$this->owner->id, $this->owner->id], Farm::whereIn('id', [$this->a->id, $this->b->id])->pluck('user_id')->all());
    }

    public function test_login_issues_working_bearer_tokens_with_the_original_roles_and_permissions(): void
    {
        foreach ([$this->owner, $this->staff, $this->admin, $this->vet] as $user) {
            $user->update(['password' => Hash::make('Fixture-only!2026')]);
            Auth::forgetGuards();
            $response = $this->postJson('/api/login', ['login' => $user->email, 'password' => 'Fixture-only!2026'])->assertOk()
                ->assertJsonPath('user.role', $user->role);
            $token = $response->json('token');
            Auth::forgetGuards();
            $this->withToken($token)->getJson('/api/me')->assertOk()->assertJsonPath('id', $user->id)->assertJsonPath('role', $user->role);
            if (in_array($user->role, ['admin', 'super_admin'], true)) {
                $this->getJson('/api/admin/farm-owners')->assertOk();
                $this->getJson('/api/farmer/farms')->assertForbidden();
            } else {
                $this->getJson('/api/admin/farm-owners')->assertForbidden();
                if ($user->role === 'farm_owner') {
                    $this->getJson('/api/farmer/farms')->assertOk()->assertJsonCount(2, 'data');
                }
            }
        }
        $this->assertSame(4, DB::table('personal_access_tokens')->count());
    }
}
