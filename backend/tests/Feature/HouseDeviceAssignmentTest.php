<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AlertHistory;
use App\Models\FarmSmsAlertState;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Services\CurrentMonitoringService;
use App\Services\DeviceAssignmentService;
use App\Services\FarmStatusService;
use App\Services\PoultryHouseService;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\PoultryHouseManagementTestCase;

class HouseDeviceAssignmentTest extends PoultryHouseManagementTestCase
{
    private function houses(int $count = 2): array
    {
        $farm = $this->createRegisteredFarm($count);

        return [$farm, DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('house_number')->pluck('id')->all()];
    }

    private function assign(Sensor $device, int $farm, int $house, ?int $version = null)
    {
        return $this->patchJson('/api/admin/sensors/'.$device->id.'/assign', ['farm_id' => $farm,
            'poultry_house_id' => $house, 'expected_assignment_version' => $version ?? app(DeviceAssignmentService::class)->version($device->id)]);
    }

    private function ingest(Sensor $device, bool $critical = true): SensorReading
    {
        $this->postJson('/api/sensor-readings', ['device_key' => $device->device_key, 'ammonia_raw' => $critical ? 3000 : 100,
            'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60,
            'poultry_house_id' => 999999, 'assignment_event_id' => 999999])->assertOk();

        return SensorReading::where('sensor_id', $device->id)->latest('id')->firstOrFail();
    }

    public function test_explicit_selection_preserves_identity_and_stamps_only_new_data(): void
    {
        $legacy = $this->ingest($this->device);
        $legacyAlert = AlertHistory::where('sensor_id', $this->device->id)->firstOrFail()->getAttributes();
        $identity = $this->device->fresh()->only(['id', 'device_key', 'label', 'sensor_code', 'installed_at', 'status']);
        [$farm, $houses] = $this->houses();
        $this->assign($this->device, $farm->id, $houses[0])->assertOk()->assertJsonPath('data.house_name', 'House 1');
        $event = $this->device->fresh()->current_assignment_event_id;
        $reading = $this->ingest($this->device);
        $this->assertSame($houses[0], (int) $reading->poultry_house_id);
        $this->assertSame((int) $event, (int) $reading->assignment_event_id);
        $incident = AlertHistory::where('sensor_id', $this->device->id)->latest('id')->firstOrFail();
        $this->assertSame($houses[0], (int) $incident->poultry_house_id);
        $this->assertSame((int) $event, (int) $incident->assignment_event_id);
        $this->assertEquals($identity, $this->device->fresh()->only(array_keys($identity)));
        $this->assertNull($legacy->fresh()->poultry_house_id);
        $this->assertNull($legacy->fresh()->assignment_event_id);
        $this->assertEquals($legacyAlert, AlertHistory::findOrFail($legacyAlert['id'])->getAttributes());
        $this->assertNull($reading->measurement_context);
        $this->assertSame(0, ActivityLog::where('details', 'like', '%'.$this->device->device_key.'%')->count());
    }

    public function test_same_farm_moves_return_visits_and_cross_farm_rotation_keep_boundaries_and_history(): void
    {
        [$farm, $houses] = $this->houses();
        [$other, $otherHouses] = $this->houses(1);
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
        $first = $this->ingest($this->device);
        $old = AlertHistory::where('sensor_id', $this->device->id)->firstOrFail();
        $before = [$first->getAttributes(), $old->getAttributes()];
        foreach ([[$farm->id, $houses[1]], [$farm->id, $houses[0]], [$other->id, $otherHouses[0]]] as [$farmId, $houseId]) {
            $floor = SensorReading::where('sensor_id', $this->device->id)->max('id');
            $this->assign($this->device, $farmId, $houseId)->assertOk();
            $device = $this->device->fresh();
            $event = DB::table('device_assignment_events')->find($device->current_assignment_event_id);
            $this->assertSame((int) $floor, (int) $event->reading_floor_id);
            $this->assertNull(app(CurrentMonitoringService::class)->latest($device, $farmId));
            $new = $this->ingest($device);
            $this->assertSame($houseId, (int) $new->poultry_house_id);
            $this->assertSame((int) $event->id, (int) $new->assignment_event_id);
            $this->assertEquals($before, [$first->fresh()->getAttributes(), $old->fresh()->getAttributes()]);
        }
        $events = DB::table('device_assignment_events')->where('sensor_id', $this->device->id)->whereNotNull('to_house_id')->orderBy('id')->get();
        $this->assertSame(['house_assignment', 'house_move', 'house_move', 'house_assignment'], $events->pluck('event_kind')->all());
        $this->assertSame(1, (int) $events->last()->from_house_number);
        $this->assertSame($farm->farm_name, $events->last()->from_farm_name);
    }

    public function test_one_active_device_per_house_and_multiple_houses_per_farm(): void
    {
        [$farm, $houses] = $this->houses();
        $other = $this->makeDevice();
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
        $before = DB::table('device_assignment_events')->count();
        $this->assign($other, $farm->id, $houses[0])->assertUnprocessable()->assertSee('already has an Active device');
        $this->assertSame($before, DB::table('device_assignment_events')->count());
        $this->assign($other, $farm->id, $houses[1])->assertOk();
        $this->assertSame(2, Sensor::where('farm_id', $farm->id)->where('status', 'Active')->count());
    }

    public function test_inactive_associations_keep_context_block_deactivation_and_cannot_steal_active_slot(): void
    {
        [$farm, $houses] = $this->houses();
        $other = $this->makeDevice('Inactive');
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
        $this->assign($other, $farm->id, $houses[0])->assertOk();
        $tuple = $other->fresh()->only(['farm_id', 'poultry_house_id', 'current_assignment_event_id']);
        $this->putJson('/api/admin/sensors/'.$other->id, ['status' => 'Active'])->assertUnprocessable();
        $this->assertSame('Inactive', $other->fresh()->status);
        $this->putJson('/api/admin/sensors/'.$this->device->id, ['status' => 'Inactive'])->assertOk();
        $this->putJson('/api/admin/sensors/'.$other->id, ['status' => 'Active'])->assertOk();
        $this->assertEquals($tuple, $other->fresh()->only(array_keys($tuple)));
        $this->patchJson('/api/farms/'.$farm->id.'/poultry-houses/'.$houses[0].'/deactivate')->assertUnprocessable();
        $this->assertSame($houses[0], (int) $this->device->fresh()->poultry_house_id);
        $this->postJson('/api/sensor-readings', ['device_key' => $this->device->device_key, 'ammonia_raw' => 3000,
            'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60])->assertForbidden();
    }

    public function test_unassignment_is_explicit_repeat_safe_and_retains_event_evidence(): void
    {
        [$farm, $houses] = $this->houses();
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
        $reading = $this->ingest($this->device)->getAttributes();
        $version = app(DeviceAssignmentService::class)->version($this->device->id);
        $url = '/api/admin/sensors/'.$this->device->id.'/unassign';
        $this->patchJson($url)->assertUnprocessable();
        $this->patchJson($url, ['expected_assignment_version' => $version])->assertOk();
        $count = DB::table('device_assignment_events')->count();
        $this->patchJson($url, ['expected_assignment_version' => $version])->assertOk();
        $this->assertSame($count, DB::table('device_assignment_events')->count());
        $this->assertNull($this->device->fresh()->farm_id);
        $this->assertNull($this->device->fresh()->poultry_house_id);
        $this->assertNull($this->device->fresh()->current_assignment_event_id);
        $event = DB::table('device_assignment_events')->where('sensor_id', $this->device->id)->latest('id')->first();
        $this->assertSame('unassignment', $event->event_kind);
        $this->assertSame($houses[0], (int) $event->from_house_id);
        $this->assertSame($farm->farm_name, $event->from_farm_name);
        $this->assertEquals($reading, SensorReading::findOrFail($reading['id'])->getAttributes());
    }

    public function test_lost_response_replay_is_safe_but_intervening_moves_reject_stale_versions(): void
    {
        [$farm, $houses] = $this->houses();
        $version = app(DeviceAssignmentService::class)->version($this->device->id);
        $this->assign($this->device, $farm->id, $houses[0], $version)->assertOk();
        $count = ActivityLog::count();
        $this->assign($this->device, $farm->id, $houses[0], $version)->assertOk();
        $this->assertSame($count, ActivityLog::count());
        $this->assign($this->device, $farm->id, $houses[1])->assertOk();
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
        $this->assign($this->device, $farm->id, $houses[0], $version)->assertConflict();
        $this->patchJson('/api/admin/sensors/'.$this->device->id.'/unassign', ['expected_assignment_version' => $version])->assertConflict();
        $this->assertSame($houses[0], (int) $this->device->fresh()->poultry_house_id);
    }

    public function test_invalid_or_unverified_destinations_never_change_legacy_assignment(): void
    {
        [$farm, $houses] = $this->houses();
        [$other, $others] = $this->houses(1);
        app(PoultryHouseService::class)->transition($this->admin, $farm->id, $houses[1], 'Inactive');
        $before = $this->device->fresh()->getAttributes();
        $this->patchJson('/api/admin/sensors/'.$this->device->id.'/assign', ['farm_id' => $farm->id])->assertUnprocessable();
        $this->assign($this->device, $farm->id, $others[0])->assertUnprocessable();
        $this->assign($this->device, $farm->id, $houses[1])->assertUnprocessable();
        $this->assign($this->device, $this->a->id, $houses[0])->assertConflict();
        $this->assertEquals($before, $this->device->fresh()->getAttributes());
        $this->assertNull($this->ingest($this->device)->poultry_house_id);
        $this->assertSame(0, DB::table('poultry_houses')->where('farm_id', $this->a->id)->count());
    }

    public static function deniedRoles(): array
    {
        return [['farm_owner'], ['vet']];
    }

    #[DataProvider('deniedRoles')]
    public function test_read_only_roles_cannot_assign_unassign_activate_or_read_credentials(string $role): void
    {
        [$farm, $houses] = $this->houses(1);
        $actor = $role === 'farm_owner' ? $this->owner : $this->user($role);
        $this->actingAs($actor, 'sanctum');
        $this->assign($this->device, $farm->id, $houses[0])->assertForbidden();
        $this->patchJson('/api/admin/sensors/'.$this->device->id.'/unassign', ['expected_assignment_version' => 1])->assertForbidden();
        $this->putJson('/api/admin/sensors/'.$this->device->id, ['status' => 'Inactive'])->assertForbidden();
        $response = $this->getJson('/api/admin/sensors')->assertForbidden();
        $this->assertStringNotContainsString($this->device->device_key, $response->getContent());
        $this->expectException(HttpException::class);
        app(DeviceAssignmentService::class)->assignHouse($actor, $this->device->id, $farm->id, $houses[0], 1);
    }

    public function test_staff_can_assign_and_farm_owner_reads_only_their_own_credential_free_houses(): void
    {
        [$farm, $houses] = $this->houses(1);
        $staff = $this->user('admin');
        $this->actingAs($staff, 'sanctum');
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
        $this->actingAs($this->owner, 'sanctum');
        $response = $this->getJson('/api/farms/'.$farm->id.'/poultry-houses')->assertOk();
        $response->assertJsonPath('data.houses.0.assigned_devices.0.id', $this->device->id);
        $this->assertStringNotContainsString($this->device->device_key, $response->getContent());
        $this->actingAs($this->user('farm_owner'), 'sanctum');
        $this->getJson('/api/farms/'.$farm->id.'/poultry-houses')->assertNotFound();
    }

    public function test_direct_service_rechecks_actor_status_instead_of_trusting_a_stale_user_object(): void
    {
        [$farm, $houses] = $this->houses(1);
        $staff = $this->user('admin');
        DB::table('users')->where('id', $staff->id)->update(['status' => 'inactive']);
        $this->expectException(HttpException::class);
        app(DeviceAssignmentService::class)->assignHouse($staff, $this->device->id, $farm->id, $houses[0], 1);
    }

    public function test_ingestion_failure_rolls_back_new_reading_alert_and_last_seen_together(): void
    {
        [$farm, $houses] = $this->houses(1);
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
        $count = SensorReading::count();
        $alerts = AlertHistory::count();
        $lastSeen = $this->device->fresh()->last_seen_at;
        AlertHistory::creating(function () {
            throw new \RuntimeException('Synthetic incident failure');
        });
        try {
            $this->postJson('/api/sensor-readings', ['device_key' => $this->device->device_key, 'ammonia_raw' => 3000,
                'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60])->assertStatus(500);
        } finally {
            AlertHistory::flushEventListeners();
            AlertHistory::clearBootedModels();
        }
        $this->assertSame($count, SensorReading::count());
        $this->assertSame($alerts, AlertHistory::count());
        $this->assertEquals($lastSeen, $this->device->fresh()->last_seen_at);
        $this->ingest($this->device);
    }

    public function test_audit_or_sensor_failure_rolls_back_tuple_event_and_audit_and_allows_retry(): void
    {
        [$farm, $houses] = $this->houses(1);
        $before = $this->device->fresh()->getAttributes();
        $count = DB::table('device_assignment_events')->count();
        $logs = ActivityLog::count();
        $listener = function () {
            throw new \RuntimeException('Synthetic final sensor failure');
        };
        Sensor::updating($listener);
        try {
            try {
                app(DeviceAssignmentService::class)->assignHouse($this->admin, $this->device->id, $farm->id, $houses[0], app(DeviceAssignmentService::class)->version($this->device->id));
                $this->fail('Expected failure');
            } catch (\RuntimeException $error) {
                $this->assertSame('Synthetic final sensor failure', $error->getMessage());
            }
        } finally {
            Sensor::flushEventListeners();
            Sensor::clearBootedModels();
        }
        $this->assertEquals($before, $this->device->fresh()->getAttributes());
        $this->assertSame($count, DB::table('device_assignment_events')->count());
        $this->assertSame($logs, ActivityLog::count());
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
    }

    public function test_same_farm_house_move_preserves_farm_sms_episode_clock_and_recovery_rule(): void
    {
        [$farm, $houses] = $this->houses();
        // A reviewed inventory can coexist with a still-legacy device. Its
        // first explicit house selection must not reset the farm SMS clock.
        app(DeviceAssignmentService::class)->change($this->device->id, $farm->id);
        $this->ingest($this->device);
        $state = FarmSmsAlertState::where('farm_id', $farm->id)->firstOrFail();
        $state->forceFill(['last_critical_sent_at' => now()->subMinutes(10)])->save();
        $clock = $state->fresh()->last_critical_sent_at;
        $token = $state->incident_token;
        $this->assign($this->device, $farm->id, $houses[0])->assertOk();
        $this->ingest($this->device);
        $this->assertSame($token, $state->fresh()->incident_token);
        $this->assertTrue($clock->equalTo($state->fresh()->last_critical_sent_at));
        $this->assign($this->device, $farm->id, $houses[1])->assertOk();
        $this->assertTrue(app(DeviceAssignmentService::class)->hasContinuousFarmAssignment($farm->id, $state->last_reading_id));
        app(FarmStatusService::class)->syncStatus($farm->fresh());
        $this->ingest($this->device);
        $this->assertSame($token, $state->fresh()->incident_token);
        $this->assertTrue($clock->equalTo($state->fresh()->last_critical_sent_at));
        $this->ingest($this->device, false);
        $this->ingest($this->device, false);
        $this->assertNull($state->fresh()->resolved_at);
        $this->ingest($this->device, false);
        $this->assertNotNull($state->fresh()->resolved_at);
        [$other, $others] = $this->houses(1);
        $this->assign($this->device, $other->id, $others[0])->assertOk();
        $this->assertFalse(app(DeviceAssignmentService::class)->hasContinuousFarmAssignment($farm->id, $state->last_reading_id));
    }
}
