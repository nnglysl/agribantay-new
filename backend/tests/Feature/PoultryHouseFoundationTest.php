<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\FarmController;
use App\Mail\OtpCodeMail;
use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\Sensor;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use Illuminate\Database\QueryException;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Support\PoultryHouseDatabase;
use Tests\TestCase;

class PoultryHouseFoundationTest extends TestCase
{
    private static ?string $fixture = null;

    private User $admin;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POULTRY_HOUSE_MYSQL_TEST') !== '1') {
            $this->markTestSkipped('Explicit disposable MySQL fixture required.');
        }
        if (self::$fixture === null) {
            self::$fixture = PoultryHouseDatabase::create();
            try {
                // Synthetic legacy data exists BEFORE additive DDL. No live rows are copied.
                $owner = $this->user('farm_owner');
                $farm = $this->farm($owner);
                $this->device($farm);
                PoultryHouseDatabase::migrate();
            } catch (\Throwable $error) {
                DB::purge('house_phase2');
                PoultryHouseDatabase::drop(self::$fixture);
                self::$fixture = null;
                throw $error;
            }
        } else {
            config(['database.connections.house_phase2' => PoultryHouseDatabase::fixtureConnection(self::$fixture)]);
            DB::purge('house_phase2');
            DB::setDefaultConnection('house_phase2');
        }
        DB::beginTransaction();
        config(['cache.default' => 'array', 'services.unisms.secret_key' => '', 'services.gemini.api_key' => '']);
        Mail::fake();
        Http::preventStrayRequests();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->admin = $this->user('super_admin');
        $this->owner = $this->user('farm_owner');
        $this->actingAs($this->admin, 'sanctum');
    }

    protected function tearDown(): void
    {
        if (self::$fixture) {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            DB::purge('house_phase2');
        }
        parent::tearDown();
    }

    public static function tearDownAfterClass(): void
    {
        if (self::$fixture) {
            PoultryHouseDatabase::drop(self::$fixture);
            self::$fixture = null;
        }
        parent::tearDownAfterClass();
    }

    private function user(string $role): User
    {
        return User::create(['first_name' => 'Synthetic', 'last_name' => $role,
            'email' => Str::uuid().'@example.test', 'password' => 'unusable-fixture',
            'must_change_password' => false, 'legal_acknowledged_at' => now(),
            'role' => $role, 'status' => 'active']);
    }

    private function farm(?User $owner = null): Farm
    {
        return Farm::create(['user_id' => ($owner ?? $this->owner)->id,
            'farm_name' => 'Synthetic '.Str::uuid(), 'owner_name' => 'Synthetic owner',
            'barangay' => 'Bagong Sikat', 'municipality' => 'San Jose', 'province' => 'Occidental Mindoro',
            'farm_size' => 'Small', 'current_status' => 'Safe', 'status' => 'Active']);
    }

    private function house(Farm $farm, int $number = 1, string $status = 'Active'): int
    {
        return DB::table('poultry_houses')->insertGetId(['farm_id' => $farm->id, 'house_number' => $number,
            'status' => $status, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function device(?Farm $farm = null, string $status = 'Active'): Sensor
    {
        return Sensor::create(['farm_id' => $farm?->id, 'device_key' => (string) Str::uuid(),
            'sensor_code' => (string) Str::uuid(), 'label' => (string) Str::uuid(), 'status' => $status]);
    }

    private function assignment(Sensor $device, Farm $farm, int $house): int
    {
        $log = ActivityLog::create(['user_id' => $this->admin->id, 'role' => 'super_admin',
            'action' => 'Assigned Sensor', 'type' => 'Farm', 'details' => 'Synthetic house assignment']);

        return DB::table('device_assignment_events')->insertGetId(['sensor_id' => $device->id,
            'activity_log_id' => $log->id, 'to_farm_id' => $farm->id, 'to_house_id' => $house,
            'to_house_number' => DB::table('poultry_houses')->where('id', $house)->value('house_number'),
            'to_farm_name' => $farm->farm_name, 'reading_floor_id' => 0, 'alert_floor_id' => 0,
            'event_kind' => 'house_assignment', 'occurred_at' => now()]);
    }

    private function associate(Sensor $device, Farm $farm, int $house): int
    {
        $event = $this->assignment($device, $farm, $house);
        $device->forceFill(['farm_id' => $farm->id, 'poultry_house_id' => $house, 'current_assignment_event_id' => $event])->save();

        return $event;
    }

    private function verified(Farm $farm, int $count = 1): void
    {
        DB::table('farms')->where('id', $farm->id)->update(['house_inventory_verified_at' => now(), 'last_house_number' => $count]);
        DB::table('poultry_house_initializations')->insert(['farm_id' => $farm->id, 'operation_id' => (string) Str::uuid(),
            'source' => 'verified_population', 'initial_house_count' => $count, 'verification_reference' => 'Synthetic authorized inventory verification',
            'verified_by' => $this->admin->id, 'verifier_role' => 'super_admin', 'completed_at' => now()]);
        $farm->refresh();
    }

    private function confirmations(array $extra = []): array
    {
        return $extra + ['permanently_discontinued' => true, 'acknowledge_permanent_loss' => true];
    }

    private function code(Farm $farm): string
    {
        $this->postJson('/api/superadmin/farms/'.$farm->id.'/delete/otp/request', $this->confirmations())->assertOk();

        return Mail::sent(OtpCodeMail::class)->last()->code;
    }

    private function invalid(callable $operation, string $constraint): void
    {
        try {
            $operation();
            $this->fail('Expected native constraint rejection: '.$constraint);
        } catch (QueryException $error) {
            $this->assertStringContainsString($constraint, $error->getMessage());
        }
    }

    private function reading(Farm $farm, Sensor $device, ?int $house = null, ?int $event = null): int
    {
        return DB::table('sensor_readings')->insertGetId(['farm_id' => $farm->id, 'sensor_id' => $device->id,
            'poultry_house_id' => $house, 'assignment_event_id' => $event, 'ammonia' => 1,
            'ammonia_status' => 'Safe', 'temperature_status' => 'Safe', 'humidity_status' => 'Safe', 'moisture_status' => 'Safe',
            'is_mock' => false, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_exact_additive_migrations_install_without_population(): void
    {
        $this->assertSame('8.0.46', DB::selectOne('SELECT VERSION() AS version')->version);
        $this->assertTrue(Schema::hasTable('poultry_houses'));
        $this->assertSame(0, DB::table('poultry_houses')->count());
        $this->assertSame(0, DB::table('poultry_house_initializations')->count());
        $this->assertTrue(Schema::hasColumn('sensors', 'active_house_slot'));
        $this->assertFalse(Schema::hasColumn('sensor_readings', 'ammonia_adc_mv'));
        $this->assertSame(0, DB::table('migrations')->count(), 'No generic migration runner or history repair.');
        $legacy = DB::table('sensors')->first();
        $this->assertNotNull($legacy->farm_id);
        $this->assertNull($legacy->poultry_house_id);
        $this->assertNull($legacy->current_assignment_event_id);
        $rules = DB::table('information_schema.REFERENTIAL_CONSTRAINTS')->where('CONSTRAINT_SCHEMA', self::$fixture)
            ->whereIn('REFERENCED_TABLE_NAME', ['poultry_houses', 'device_assignment_events'])->get();
        $this->assertCount(8, $rules);
        $this->assertTrue($rules->every(fn ($rule) => $rule->DELETE_RULE === 'RESTRICT' && $rule->UPDATE_RULE === 'RESTRICT'));
        $this->assertSame(0, DB::table('information_schema.KEY_COLUMN_USAGE')->where('TABLE_SCHEMA', self::$fixture)
            ->whereIn('TABLE_NAME', ['poultry_house_initializations', 'device_assignment_events'])->whereNotNull('REFERENCED_TABLE_NAME')->count());
        $columns = DB::table('information_schema.COLUMNS')->where('TABLE_SCHEMA', self::$fixture)->where('TABLE_NAME', 'sensors')->get()->keyBy('COLUMN_NAME');
        $this->assertSame('bigint unsigned', $columns['poultry_house_id']->COLUMN_TYPE);
        $this->assertSame('YES', $columns['poultry_house_id']->IS_NULLABLE);
        $this->assertStringContainsString('STORED GENERATED', $columns['active_house_slot']->EXTRA);
        $this->assertSame('json', DB::table('information_schema.COLUMNS')->where('TABLE_SCHEMA', self::$fixture)
            ->where('TABLE_NAME', 'sensor_readings')->where('COLUMN_NAME', 'measurement_context')->value('DATA_TYPE'));
        $this->assertSame('RESTRICT', DB::table('information_schema.REFERENTIAL_CONSTRAINTS')->where('CONSTRAINT_SCHEMA', self::$fixture)
            ->where('TABLE_NAME', 'farm_control_documents')->where('REFERENCED_TABLE_NAME', 'farms')->value('DELETE_RULE'));
    }

    public function test_house_identity_numbering_and_initialization_uniqueness(): void
    {
        $farm = $this->farm();
        $house = $this->house($farm);
        $other = $this->farm();
        $this->house($other);
        $this->invalid(fn () => $this->house($farm), 'ph_farm_number_uq');
        $this->invalid(fn () => $this->house($farm, 0), 'ph_number_positive');
        $this->invalid(fn () => DB::table('poultry_houses')->where('id', $house)->update(['house_number' => 8]), 'immutable');
        $this->invalid(fn () => DB::table('poultry_houses')->where('id', $house)->update(['farm_id' => $other->id]), 'immutable');
        DB::table('poultry_houses')->where('id', $house)->update(['status' => 'Inactive']);
        $this->invalid(fn () => $this->house($farm), 'ph_farm_number_uq');
        $this->house($farm, 2);
        $this->verified($farm, 2);
        $this->invalid(fn () => $this->verified($farm, 2), 'phi_farm_uq');
        $this->invalid(fn () => DB::table('poultry_house_initializations')->where('farm_id', $farm->id)
            ->update(['source' => 'registration', 'initial_house_count' => 0]), 'phi_registration_count');
        $this->invalid(fn () => $farm->delete(), 'poultry_houses_farm_id_foreign');
    }

    public function test_active_occupancy_and_inactive_associations(): void
    {
        $farm = $this->farm();
        $house = $this->house($farm);
        $first = $this->device();
        $second = $this->device(null, 'Inactive');
        $this->associate($first, $farm, $house);
        $this->associate($second, $farm, $house);
        $this->invalid(fn () => $second->update(['status' => 'Active']), 'sensors_active_house_uq');
        $first->update(['status' => 'Inactive']);
        $second->refresh()->update(['status' => 'Active']);
        $this->assertSame($house, (int) $second->fresh()->active_house_slot);
        $this->invalid(fn () => DB::table('poultry_houses')->where('id', $house)->update(['status' => 'Inactive']), 'Explicitly unassign');
        app(DeviceAssignmentService::class)->change($second->id, null);
        $this->invalid(fn () => DB::table('poultry_houses')->where('id', $house)->update(['status' => 'Inactive']), 'Explicitly unassign');
        app(DeviceAssignmentService::class)->change($first->id, null);
        DB::table('poultry_houses')->where('id', $house)->update(['status' => 'Inactive']);
        $this->invalid(fn () => $this->associate($this->device(), $farm, $house), 'Devices can only be associated with an Active house');
        $this->invalid(fn () => $this->associate($this->device(null, 'Inactive'), $farm, $house), 'Devices can only be associated with an Active house');
        $this->assertNull($second->fresh()->farm_id);
        $this->assertNull($second->fresh()->poultry_house_id);
    }

    public function test_membership_assignment_identity_and_null_context_are_enforced(): void
    {
        $farm = $this->farm();
        $other = $this->farm();
        $house = $this->house($farm);
        $device = $this->device();
        $event = $this->assignment($device, $farm, $house);
        $this->invalid(fn () => DB::table('sensors')->where('id', $device->id)->update(['farm_id' => $other->id,
            'poultry_house_id' => $house, 'current_assignment_event_id' => $event]), 'sensors_house_membership_fk');
        $this->invalid(fn () => DB::table('sensors')->where('id', $device->id)->update(['poultry_house_id' => $house,
            'current_assignment_event_id' => $event]), 'House assignment requires its farm');
        $otherDevice = $this->device();
        $this->invalid(fn () => DB::table('sensors')->where('id', $otherDevice->id)->update(['farm_id' => $farm->id,
            'poultry_house_id' => $house, 'current_assignment_event_id' => $event]), 'sensors_assignment_context_fk');
        $this->invalid(fn () => DB::table('sensors')->where('id', $device->id)->update(['farm_id' => $farm->id,
            'poultry_house_id' => $house]), 'sensors_house_context_ck');
        $legacy1 = $this->device($farm);
        $legacy2 = $this->device($farm);
        $this->assertNull($legacy1->fresh()->active_house_slot);
        $this->assertNull($legacy2->fresh()->active_house_slot);
    }

    public function test_reading_and_alert_provenance_constraints_preserve_nullable_sensor_history(): void
    {
        $farm = $this->farm();
        $other = $this->farm();
        $house = $this->house($farm);
        $device = $this->device();
        $event = $this->associate($device, $farm, $house);
        $reading = $this->reading($farm, $device, $house, $event);
        $this->reading($farm, $device); // Legacy attribution remains unknown.
        $this->invalid(fn () => $this->reading($other, $device, $house, $event), 'foreign key constraint');
        $this->invalid(fn () => $this->reading($farm, $this->device(), $house, $event), 'sr_assignment_device_fk');
        $this->invalid(fn () => $this->reading($farm, $device, $house), 'sr_house_context_ck');
        $alert = ['farm_id' => $farm->id, 'sensor_id' => $device->id, 'poultry_house_id' => $house,
            'assignment_event_id' => $event, 'sensor_type' => 'ammonia', 'status' => 'Critical', 'value' => 25,
            'triggered_at' => now(), 'created_at' => now()];
        DB::table('alert_history')->insert($alert);
        $this->invalid(fn () => DB::table('alert_history')->insert(array_replace($alert, ['farm_id' => $other->id])), 'foreign key constraint');
        $this->invalid(fn () => DB::table('alert_history')->insert(array_replace($alert, ['sensor_id' => $this->device()->id])), 'ah_assignment_device_fk');
        app(DeviceAssignmentService::class)->change($device->id, null);
        $device->delete();
        $stored = DB::table('sensor_readings')->where('id', $reading)->first();
        $this->assertNull($stored->sensor_id);
        $this->assertSame($event, (int) $stored->assignment_event_id);
        $this->assertNull(DB::table('alert_history')->value('sensor_id'));
        $this->invalid(fn () => DB::table('poultry_houses')->where('id', $house)->delete(), 'foreign key constraint');
        $this->invalid(fn () => DB::table('device_assignment_events')->where('id', $event)->delete(), 'foreign key constraint');
    }

    public function test_deletion_requires_verified_inventory_closure_status_and_manual_unassignment(): void
    {
        $farm = $this->farm();
        $url = '/api/superadmin/farms/'.$farm->id.'/delete/otp/request';
        $this->postJson($url, $this->confirmations())->assertStatus(422)->assertJsonFragment(['message' => 'Only a deactivated farm can be deleted. Deactivate the farm first.']);
        $farm->update(['status' => 'Deactivated']);
        $this->postJson($url, $this->confirmations())->assertStatus(422)->assertSee('unverified');
        $house = $this->house($farm);
        $this->verified($farm);
        $this->postJson($url, $this->confirmations())->assertStatus(422)->assertSee('Deactivate every poultry house');
        DB::table('poultry_houses')->where('id', $house)->update(['status' => 'Inactive']);
        $device = $this->device($farm, 'Inactive');
        $logs = ActivityLog::count();
        $this->postJson($url, $this->confirmations())->assertStatus(422)->assertSee('Explicitly unassign');
        $this->assertSame($logs, ActivityLog::count());
        $this->assertSame($farm->id, $device->fresh()->farm_id);
        app(DeviceAssignmentService::class)->change($device->id, null);
        $this->postJson($url)->assertStatus(422)->assertJsonValidationErrors(['permanently_discontinued', 'acknowledge_permanent_loss']);
        $this->assertNotEmpty($this->code($farm));
    }

    public function test_protected_control_documents_block_both_otp_and_final_delete(): void
    {
        $farm = $this->farm();
        $farm->update(['status' => 'Deactivated']);
        $this->verified($farm, 0);
        $code = $this->code($farm);
        DB::table('farm_control_documents')->insert(['farm_id' => $farm->id, 'uploaded_by' => $this->owner->id,
            'uploader_name' => 'Synthetic uploader', 'category' => 'odor_control', 'original_name' => 'protected.pdf',
            'file_path' => 'synthetic/protected.pdf', 'mime_type' => 'application/pdf', 'file_size' => 12]);
        $this->postJson('/api/superadmin/farms/'.$farm->id.'/delete/otp/request', $this->confirmations())->assertStatus(422)->assertSee('Protected Control Documents');
        $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->confirmations(['code' => $code]))->assertStatus(422)->assertSee('Protected Control Documents');
        $this->assertSame(1, DB::table('farm_control_documents')->count());
        $this->assertNotNull($farm->fresh());
        $this->assertNull(Cache::get('farm-delete-otp:'.$this->admin->id.':'.$farm->id));
    }

    public function test_successful_parent_delete_retains_manual_assignment_initialization_and_audit_evidence(): void
    {
        $farm = $this->farm();
        $house = $this->house($farm);
        $this->verified($farm);
        $device = $this->device();
        $event = $this->associate($device, $farm, $house);
        $this->reading($farm, $device, $house, $event);
        $identity = [$device->device_key, $device->label, $device->sensor_code];
        $outgoing = app(DeviceAssignmentService::class)->change($device->id, null);
        $closing = DB::table('device_assignment_events')->where('sensor_id', $device->id)->latest('id')->first();
        $this->assertSame($house, (int) $closing->from_house_id);
        $this->assertSame(1, (int) $closing->from_house_number);
        $this->assertSame($farm->farm_name, $closing->from_farm_name);
        DB::table('poultry_houses')->where('id', $house)->update(['status' => 'Inactive']);
        $farm->update(['status' => 'Deactivated']);
        $staff = $this->user('admin');
        $vet = $this->user('vet');
        $beforeEvents = DB::table('device_assignment_events')->orderBy('id')->get()->toJson();
        $code = $this->code($farm);
        $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->confirmations(['code' => $code]))->assertOk()->assertJsonPath('owner_deleted', true);
        $this->assertNull($farm->fresh());
        $this->assertSame(0, DB::table('poultry_houses')->where('farm_id', $farm->id)->count());
        $this->assertSame(1, DB::table('poultry_house_initializations')->where('farm_id', $farm->id)->count());
        $this->assertSame($beforeEvents, DB::table('device_assignment_events')->orderBy('id')->get()->toJson());
        $this->assertNotNull(ActivityLog::find($closing->activity_log_id));
        $this->assertStringContainsString('permanent discontinuation verified', ActivityLog::where('action', 'Deleted Farm')->value('details'));
        $this->assertSame($identity, [$outgoing->fresh()->device_key, $outgoing->fresh()->label, $outgoing->fresh()->sensor_code]);
        foreach ([$this->admin, $staff, $vet] as $user) {
            $this->assertNotNull($user->fresh());
        }
        $this->assertNull($this->owner->fresh());
    }

    public function test_otp_scope_wrong_code_single_use_and_recheck_after_issuance(): void
    {
        $farm = $this->farm();
        $farm->update(['status' => 'Deactivated']);
        $this->verified($farm, 0);
        $code = $this->code($farm);
        $bad = $code === '000000' ? '111111' : '000000';
        $url = '/api/superadmin/farms/'.$farm->id;
        $this->deleteJson($url, $this->confirmations(['code' => $bad]))->assertStatus(422)->assertSee('Invalid verification code');
        $other = $this->farm();
        $other->update(['status' => 'Deactivated']);
        $this->verified($other, 0);
        $this->deleteJson('/api/superadmin/farms/'.$other->id, $this->confirmations(['code' => $code]))->assertStatus(422)->assertSee('expired');
        $device = $this->device($farm);
        $this->deleteJson($url, $this->confirmations(['code' => $code]))->assertStatus(422)->assertSee('Explicitly unassign');
        $this->assertSame($farm->id, $device->fresh()->farm_id);
        $this->deleteJson($url, $this->confirmations(['code' => $code]))->assertStatus(422)->assertSee('expired');
        $this->actingAs($this->user('admin'), 'sanctum')->deleteJson($url, $this->confirmations(['code' => $code]))->assertForbidden();
        $this->assertNotNull($farm->fresh());
    }

    public function test_final_audit_failure_rolls_back_operational_deletion_without_reassigning_devices(): void
    {
        $farm = $this->farm();
        $house = $this->house($farm, 1, 'Inactive');
        $this->verified($farm);
        $device = $this->device($farm);
        $reading = $this->reading($farm, $device);
        app(DeviceAssignmentService::class)->change($device->id, null);
        $farm->update(['status' => 'Deactivated']);
        $code = $this->code($farm);
        $events = DB::table('device_assignment_events')->get()->toJson();
        ActivityLog::creating(function ($log) {
            if ($log->action === 'Deleted Farm') {
                throw new \RuntimeException('Synthetic audit failure');
            }
        });
        try {
            $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->confirmations(['code' => $code]))->assertStatus(500);
        } finally {
            ActivityLog::flushEventListeners();
        }
        $this->assertNotNull($farm->fresh());
        $this->assertNotNull($this->owner->fresh());
        $this->assertTrue(DB::table('poultry_houses')->where('id', $house)->exists());
        $this->assertTrue(DB::table('sensor_readings')->where('id', $reading)->exists());
        $this->assertSame($events, DB::table('device_assignment_events')->get()->toJson());
        $this->assertNull($device->fresh()->farm_id);
        $this->assertNull(Cache::get('farm-delete-otp:'.$this->admin->id.':'.$farm->id));
    }

    public function test_legacy_farm_assignment_ingestion_and_rotation_remain_available(): void
    {
        $farm = $this->farm();
        $other = $this->farm();
        $device = $this->device();
        app(DeviceAssignmentService::class)->change($device->id, $farm->id);
        $this->postJson('/api/sensor-readings', ['device_key' => $device->device_key,
            'ammonia_raw' => 100, 'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60])->assertOk();
        $reading = DB::table('sensor_readings')->where('sensor_id', $device->id)->first();
        $this->assertSame($farm->id, (int) $reading->farm_id);
        $this->assertNull($reading->poultry_house_id);
        $this->assertNull($reading->assignment_event_id);
        app(DeviceAssignmentService::class)->change($device->id, $other->id);
        $this->assertSame($other->id, $device->fresh()->farm_id);
        $this->assertSame($farm->id, (int) DB::table('sensor_readings')->where('id', $reading->id)->value('farm_id'));
        $this->assertSame(0, DB::table('poultry_houses')->count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_farm_deactivation_and_reactivation_preserve_houses_devices_and_history(): void
    {
        $farm = $this->farm();
        $house = $this->house($farm);
        $device = $this->device();
        $event = $this->associate($device, $farm, $house);
        $reading = $this->reading($farm, $device, $house, $event);
        $controller = app(FarmController::class);
        $this->assertSame(200, $controller->deactivate($farm->id)->getStatusCode());
        $this->assertSame('Deactivated', $farm->fresh()->status);
        $this->assertSame('Active', DB::table('poultry_houses')->where('id', $house)->value('status'));
        $this->assertSame($house, (int) $device->fresh()->poultry_house_id);
        $this->assertTrue(DB::table('sensor_readings')->where('id', $reading)->exists());
        $this->assertSame(200, $controller->activate($farm->id)->getStatusCode());
        $this->assertSame('Active', $farm->fresh()->status);
        $this->assertSame('active', $this->owner->fresh()->status);
    }

    public function test_migrations_refuse_replay_and_destructive_down_paths(): void
    {
        foreach (glob(database_path('migrations/2026_11_01_000*.php')) as $file) {
            $migration = require $file;
            try {
                $migration->down();
                $this->fail('Expected forward-only guard.');
            } catch (\RuntimeException $error) {
                $this->assertStringContainsString('forward-only', $error->getMessage());
            }
            try {
                $migration->up();
                $this->fail('Expected replay guard.');
            } catch (\RuntimeException $error) {
                $this->assertStringContainsString('existing', strtolower($error->getMessage()));
            }
        }
    }

    public function test_expired_otp_and_resend_require_the_current_code(): void
    {
        $farm = $this->farm();
        $farm->update(['status' => 'Deactivated']);
        $this->verified($farm, 0);
        $code = $this->code($farm);
        $this->travel(11)->minutes();
        try {
            $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->confirmations(['code' => $code]))->assertStatus(422)->assertSee('expired');
        } finally {
            $this->travelBack();
        }
        $first = $this->code($farm);
        $second = $this->code($farm);
        if ($first !== $second) {
            $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->confirmations(['code' => $first]))->assertStatus(422)->assertSee('Invalid');
        }
        $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->confirmations(['code' => $second]))->assertOk();
        $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->confirmations(['code' => $second]))->assertNotFound();
    }

    public function test_remaining_farm_and_privileged_account_retention_rules(): void
    {
        $remaining = $this->farm();
        foreach ([$this->owner, $this->user('admin'), $this->user('vet'), $this->admin] as $owner) {
            $farm = $this->farm($owner);
            $farm->update(['status' => 'Deactivated']);
            $this->verified($farm, 0);
            $code = $this->code($farm);
            $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->confirmations(['code' => $code]))->assertOk()->assertJsonPath('owner_deleted', false);
            $this->assertNotNull($owner->fresh());
        }
        $this->assertNotNull($remaining->fresh());
        $this->assertSame('active', $this->owner->fresh()->status);
    }
}
