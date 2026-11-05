<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use App\Services\PoultryHouseFoundationReadiness;
use App\Services\PoultryHouseService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\Phase9FoundationDatabase;
use Tests\Support\PoultryHouseManagementTestCase;

class PoultryHouseManagementTest extends PoultryHouseManagementTestCase
{
    private function url(Farm $farm, ?int $house = null, ?string $action = null): string
    {
        return '/api/farms/'.$farm->id.'/poultry-houses'.($house ? '/'.$house.'/'.$action : '');
    }

    public static function invalidCounts(): array
    {
        return [['missing'], [0], [-1], [1.5], ['invalid'], [1001]];
    }

    #[DataProvider('invalidCounts')]
    public function test_registration_requires_a_positive_whole_house_count_for_every_farm(mixed $count): void
    {
        $payload = $this->registrationPayload();
        if ($count === 'missing') {
            unset($payload['farms'][1]['house_count']);
        } else {
            $payload['farms'][1]['house_count'] = $count;
        }
        $before = [User::count(), Farm::count(), ActivityLog::count()];
        $this->postJson('/api/admin/farm-owners', $payload)->assertUnprocessable()->assertJsonValidationErrors('farms.1.house_count');
        $this->assertSame($before, [User::count(), Farm::count(), ActivityLog::count()]);
        $this->assertSame(0, DB::table('poultry_houses')->count());
        $this->assertSame(0, DB::table('poultry_house_initializations')->count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_atomic_registration_initializes_independent_house_sequences_and_evidence(): void
    {
        $response = $this->postJson('/api/admin/farm-owners', $this->registrationPayload())->assertOk();
        $owner = User::findOrFail($response->json('id'));
        $farms = $owner->farms()->orderBy('id')->get();
        $this->assertCount(2, $farms);
        foreach ([3, 2] as $index => $count) {
            $farm = $farms[$index];
            $this->assertSame(range(1, $count), DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('house_number')->pluck('house_number')->map(fn ($v) => (int) $v)->all());
            $this->assertSame($count, (int) $farm->last_house_number);
            $this->assertNotNull($farm->house_inventory_verified_at);
            $evidence = DB::table('poultry_house_initializations')->where('farm_id', $farm->id)->first();
            $this->assertSame('registration', $evidence->source);
            $this->assertSame($count, (int) $evidence->initial_house_count);
            $this->assertSame($this->admin->id, (int) $evidence->verified_by);
            $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $evidence->manifest_sha256);
        }
        $this->assertSame(1, DB::table('poultry_house_initializations')->distinct()->count('operation_id'));
        $this->assertSame(2, ActivityLog::where('action', 'Initialized Poultry Houses')->count());
        $this->assertSame(2, ActivityLog::where('action', 'Registered Farm')->count());
        $this->assertSame($this->a->id, $this->device->fresh()->farm_id);
        $this->assertNull($this->device->fresh()->poultry_house_id);
    }

    public function test_registration_audit_failure_rolls_back_owner_farms_houses_evidence_and_audit(): void
    {
        $before = [User::count(), Farm::count(), ActivityLog::count()];
        ActivityLog::creating(function ($log) {
            if ($log->action === 'Registered Farm' && str_contains($log->details, 'Atomic Farm 2')) {
                throw new \RuntimeException('Synthetic final registration audit failure');
            }
        });
        try {
            $this->postJson('/api/admin/farm-owners', $this->registrationPayload())->assertStatus(500);
        } finally {
            ActivityLog::flushEventListeners();
        }
        $this->assertSame($before, [User::count(), Farm::count(), ActivityLog::count()]);
        $this->assertSame(0, DB::table('poultry_houses')->count());
        $this->assertSame(0, DB::table('poultry_house_initializations')->count());
        Mail::assertNothingSent();
    }

    public function test_existing_owner_gets_new_farms_without_reinitializing_legacy_farms(): void
    {
        $users = User::count();
        $this->postJson('/api/admin/farms', ['farm_owner_id' => $this->owner->id, 'farms' => $this->registrationPayload()['farms']])->assertOk();
        $this->assertSame($users, User::count());
        $this->assertSame(4, $this->owner->farms()->count());
        $this->assertSame(5, DB::table('poultry_houses')->count());
        $this->assertSame(0, DB::table('poultry_houses')->whereIn('farm_id', [$this->a->id, $this->b->id])->count());
        $this->assertNull($this->a->fresh()->house_inventory_verified_at);
        $payload = ['farm_owner_id' => $this->owner->id, 'farms' => [array_replace($this->registrationPayload()['farms'][0], ['id' => $this->a->id])]];
        $this->postJson('/api/admin/farms', $payload)->assertUnprocessable()->assertJsonValidationErrors('farms.0.id');
        Mail::assertNothingSent();
    }

    public function test_add_retry_and_lifecycle_are_idempotent_and_numbers_are_not_reused(): void
    {
        $farm = $this->createRegisteredFarm(2);
        $first = (int) DB::table('poultry_houses')->where('farm_id', $farm->id)->min('id');
        $request = ['request_id' => (string) Str::uuid()];
        $this->postJson($this->url($farm), $request)->assertCreated()->assertJsonPath('data.house.name', 'House 3')->assertJsonPath('data.replayed', false);
        $logs = ActivityLog::count();
        $this->postJson($this->url($farm), $request)->assertOk()->assertJsonPath('data.house.name', 'House 3')->assertJsonPath('data.replayed', true);
        $this->assertSame($logs, ActivityLog::count());
        $this->patchJson($this->url($farm, $first, 'deactivate'))->assertOk()->assertJsonPath('data.house.status', 'Inactive');
        $logs = ActivityLog::count();
        $this->patchJson($this->url($farm, $first, 'deactivate'))->assertOk()->assertJsonPath('data.replayed', true);
        $this->assertSame($logs, ActivityLog::count());
        $this->assertSame('Active', $farm->fresh()->status);
        $this->postJson($this->url($farm), ['request_id' => (string) Str::uuid()])->assertCreated()->assertJsonPath('data.house.name', 'House 4');
        $this->patchJson($this->url($farm, $first, 'reactivate'))->assertOk()->assertJsonPath('data.house.name', 'House 1');
        $logs = ActivityLog::count();
        $this->patchJson($this->url($farm, $first, 'reactivate'))->assertOk()->assertJsonPath('data.replayed', true);
        $this->assertSame($logs, ActivityLog::count());
        $house = DB::table('poultry_houses')->where('id', $first)->first();
        $this->assertNotNull($house->deactivated_at);
        $this->assertNotNull($house->reactivated_at);
        $this->assertSame(4, (int) $farm->fresh()->last_house_number);
        $this->assertSame(0, DB::table('sensors')->where('poultry_house_id', $first)->count());
    }

    public static function statuses(): array
    {
        return [['Active'], ['Inactive']];
    }

    #[DataProvider('statuses')]
    public function test_every_device_status_blocks_deactivation_until_explicit_unassignment(string $status): void
    {
        $farm = $this->createRegisteredFarm();
        $house = (int) DB::table('poultry_houses')->where('farm_id', $farm->id)->value('id');
        // Test-only recorded assignment. Phase 3 exposes no house-assignment API.
        $device = $this->makeDevice($status);
        $log = ActivityLog::create(['user_id' => $this->admin->id, 'role' => 'super_admin', 'action' => 'Synthetic association', 'type' => 'Farm']);
        $event = DB::table('device_assignment_events')->insertGetId(['sensor_id' => $device->id, 'activity_log_id' => $log->id,
            'to_farm_id' => $farm->id, 'to_house_id' => $house, 'reading_floor_id' => 0, 'alert_floor_id' => 0, 'occurred_at' => now()]);
        $device->forceFill(['farm_id' => $farm->id, 'poultry_house_id' => $house, 'current_assignment_event_id' => $event])->save();
        $before = DB::table('device_assignment_events')->count();
        $this->patchJson($this->url($farm, $house, 'deactivate'))->assertUnprocessable()->assertSee('Explicitly unassign');
        $this->assertSame($house, (int) $device->fresh()->poultry_house_id);
        $this->assertSame($before, DB::table('device_assignment_events')->count());
        $view = $this->getJson($this->url($farm))->assertOk();
        $view->assertJsonPath('data.houses.0.assigned_devices.0.device_name', $device->label);
        $view->assertJsonPath('data.houses.0.assigned_devices.0.status', $status);
        $this->assertStringNotContainsString($device->device_key, $view->getContent());
        $this->patchJson('/api/admin/sensors/'.$device->id.'/unassign', ['expected_assignment_version' => app(DeviceAssignmentService::class)->version($device->id)])->assertOk();
        $this->patchJson($this->url($farm, $house, 'deactivate'))->assertOk();
        $this->patchJson($this->url($farm, $house, 'reactivate'))->assertOk();
        $this->assertNull($device->fresh()->farm_id);
        $this->assertNull($device->fresh()->poultry_house_id);
        $this->assertSame($before + 1, DB::table('device_assignment_events')->count());
    }

    public function test_authorization_and_multi_farm_owner_isolation_are_enforced(): void
    {
        $first = $this->createRegisteredFarm();
        $second = $this->createRegisteredFarm(2);
        $other = $this->createRegisteredFarm(1, $this->user('farm_owner'));
        $house = (int) DB::table('poultry_houses')->where('farm_id', $first->id)->value('id');
        $this->actingAs($this->owner, 'sanctum');
        $this->getJson($this->url($first))->assertOk()->assertJsonPath('data.can_manage', false)->assertJsonCount(1, 'data.houses');
        $this->getJson($this->url($second))->assertOk()->assertJsonCount(2, 'data.houses');
        $this->getJson($this->url($other))->assertNotFound();
        foreach ([$this->owner, $this->user('vet')] as $reader) {
            $this->actingAs($reader, 'sanctum');
            $this->postJson($this->url($first), ['request_id' => (string) Str::uuid()])->assertForbidden();
            $this->patchJson($this->url($first, $house, 'deactivate'))->assertForbidden();
            $this->patchJson($this->url($first, $house, 'reactivate'))->assertForbidden();
            try {
                app(PoultryHouseService::class)->add($reader, $first->id, (string) Str::uuid());
                $this->fail('The service must reject read-only roles even without route middleware.');
            } catch (HttpExceptionInterface $error) {
                $this->assertSame(403, $error->getStatusCode());
            }
        }
        $this->getJson($this->url($first))->assertOk()->assertJsonPath('data.can_manage', false);
        $first->update(['status' => 'Deactivated']);
        $this->getJson($this->url($first))->assertNotFound();
        $staff = $this->user('admin');
        $this->actingAs($staff, 'sanctum')->postJson($this->url($second), ['request_id' => (string) Str::uuid()])->assertCreated();
        $this->getJson($this->url($first))->assertOk()->assertJsonPath('data.can_manage', true);
        $staff->update(['status' => 'inactive']);
        try {
            app(PoultryHouseService::class)->add($staff, $second->id, (string) Str::uuid());
            $this->fail('A stale active user object cannot authorize management.');
        } catch (HttpExceptionInterface $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
    }

    public function test_legacy_inventory_and_farm_only_devices_are_never_inferred_or_populated(): void
    {
        $before = $this->device->getAttributes();
        $this->getJson($this->url($this->a))->assertOk()->assertJsonPath('data.inventory_status', 'unverified')
            ->assertJsonPath('data.can_manage', false)->assertJsonCount(0, 'data.houses');
        $this->postJson($this->url($this->a), ['request_id' => (string) Str::uuid()])->assertStatus(409);
        $this->assertSame(0, DB::table('poultry_houses')->count());
        $this->assertSame(0, DB::table('poultry_house_initializations')->count());
        $this->assertEquals($before, $this->device->fresh()->getAttributes());
        $this->assertSame(0, (int) $this->a->fresh()->last_house_number);
        $this->getJson('/api/admin/farms/'.$this->a->id)->assertOk()->assertJsonPath('data.id', $this->a->id);
    }

    public function test_nested_membership_and_immutable_identity_have_no_rename_or_delete_path(): void
    {
        $first = $this->createRegisteredFarm();
        $second = $this->createRegisteredFarm();
        $house = (int) DB::table('poultry_houses')->where('farm_id', $first->id)->value('id');
        $this->patchJson($this->url($second, $house, 'deactivate'))->assertNotFound();
        foreach (['name' => 'Custom', 'house_number' => 99, 'farm_id' => $second->id, 'device_id' => $this->device->id, 'status' => 'Inactive'] as $field => $value) {
            $this->postJson($this->url($first), ['request_id' => (string) Str::uuid(), $field => $value])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->deleteJson('/api/farms/'.$first->id.'/poultry-houses/'.$house)->assertNotFound();
        $this->putJson('/api/farms/'.$first->id.'/poultry-houses/'.$house, ['name' => 'Renamed'])->assertNotFound();
        $this->assertSame('Active', DB::table('poultry_houses')->where('id', $house)->value('status'));
    }

    public function test_audit_failure_rolls_back_add_and_the_same_request_can_be_retried(): void
    {
        $farm = $this->createRegisteredFarm();
        $request = ['request_id' => (string) Str::uuid()];
        $before = ActivityLog::count();
        ActivityLog::creating(function ($log) {
            if ($log->action === 'Added Poultry House') {
                throw new \RuntimeException('Synthetic house audit failure');
            }
        });
        try {
            $this->postJson($this->url($farm), $request)->assertStatus(500);
        } finally {
            ActivityLog::flushEventListeners();
        }
        $this->assertSame(1, (int) $farm->fresh()->last_house_number);
        $this->assertSame(1, DB::table('poultry_houses')->where('farm_id', $farm->id)->count());
        $this->assertSame($before, ActivityLog::count());
        $this->postJson($this->url($farm), $request)->assertCreated()->assertJsonPath('data.house.name', 'House 2');
    }

    public function test_lifecycle_audit_failure_rolls_back_status_and_timestamps(): void
    {
        $farm = $this->createRegisteredFarm();
        $house = DB::table('poultry_houses')->where('farm_id', $farm->id)->first();
        $before = ActivityLog::count();
        ActivityLog::creating(function ($log) {
            if ($log->action === 'Deactivated Poultry House') {
                throw new \RuntimeException('Synthetic lifecycle audit failure');
            }
        });
        try {
            $this->patchJson($this->url($farm, $house->id, 'deactivate'))->assertStatus(500);
        } finally {
            ActivityLog::flushEventListeners();
        }
        $this->assertEquals($house, DB::table('poultry_houses')->where('id', $house->id)->first());
        $this->assertSame($before, ActivityLog::count());
        $this->assertSame('Active', $farm->fresh()->status);
    }

    public function test_partial_installation_history_blocks_management_without_repair(): void
    {
        $farm = $this->createRegisteredFarm();
        $expected = 3;
        if (Phase9FoundationDatabase::enabled()) {
            $expected = DB::table('migrations')->count() - 1;
            $names = array_keys(getenv('PHASE9_APPLICATION_ENGINE') === 'mariadb'
                ? PoultryHouseFoundationReadiness::MARIADB : PoultryHouseFoundationReadiness::MYSQL);
            Phase9FoundationDatabase::privileged($this->fixture)->prepare('DELETE FROM migrations WHERE migration=?')->execute([end($names)]);
        } else {
            DB::table('migrations')->where('migration', '2026_11_01_000300_add_house_provenance_to_monitoring_history')->delete();
        }
        $before = ActivityLog::count();
        $this->getJson($this->url($farm))->assertOk()->assertJsonPath('data.available', false);
        $this->postJson($this->url($farm), ['request_id' => (string) Str::uuid()])->assertStatus(503);
        $this->assertSame(1, (int) $farm->fresh()->last_house_number);
        $this->assertSame($before, ActivityLog::count());
        $this->assertSame($expected, DB::table('migrations')->count());
    }
}
