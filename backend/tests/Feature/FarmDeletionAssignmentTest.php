<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\Support\PhaseOneCorrectionTestCase;

/** Deletions here target only brand-new, private SQLite fixture records. */
class FarmDeletionAssignmentTest extends PhaseOneCorrectionTestCase
{
    public function test_deletion_requires_prior_explicit_unassignment_and_preserves_other_history(): void
    {
        $other = $this->device('Correction D02', $this->b);
        $preserved = $this->ingest($other);
        $attributes = $preserved->getAttributes();
        DB::table('generated_reports')->insert(['payload' => 'Existing immutable report fixture']);
        $last = $this->ingest($this->device, true);
        $alert = AlertHistory::where('sensor_id', $this->device->id)->max('id');
        $this->a->update(['status' => 'Deactivated']);
        $this->postJson('/api/superadmin/farms/'.$this->a->id.'/delete/otp/request', $this->deletionConfirmations())->assertStatus(422);
        app(DeviceAssignmentService::class)->change($this->device->id, null);
        $code = $this->deletionCode($this->a);
        $this->deleteJson('/api/superadmin/farms/'.$this->a->id, $this->deletionConfirmations(['code' => $code]))->assertOk()
            ->assertJsonPath('owner_deleted', false);
        $closing = DB::table('device_assignment_events')->where('sensor_id', $this->device->id)->latest('id')->first();
        $this->assertSame($this->a->id, (int) $closing->from_farm_id);
        $this->assertNull($closing->to_farm_id);
        $this->assertSame($last->id, (int) $closing->reading_floor_id);
        $this->assertSame((int) $alert, (int) $closing->alert_floor_id);
        $this->assertSame('Unassigned Sensor', ActivityLog::findOrFail($closing->activity_log_id)->action);
        $this->assertSame(1, ActivityLog::where('action', 'Deleted Farm')->count());
        $this->assertNull($this->device->fresh()->farm_id);
        $this->assertNull(Farm::find($this->a->id));
        $this->assertNotNull(User::find($this->owner->id));
        $this->assertNotNull(User::find($this->admin->id));
        $this->assertEquals($attributes, $preserved->fresh()->getAttributes());
        $this->assertSame('Existing immutable report fixture', DB::table('generated_reports')->value('payload'));
        $this->postJson('/api/sensor-readings', $this->payload($this->device))->assertStatus(409);
        $this->assertSame(1, SensorReading::count());
    }

    public function test_failure_of_the_final_audit_rolls_back_deletion_and_preserves_prior_unassignment(): void
    {
        $reading = $this->ingest($this->device, true);
        $attributes = $reading->getAttributes();
        $this->a->update(['status' => 'Deactivated']);
        app(DeviceAssignmentService::class)->change($this->device->id, null);
        $code = $this->deletionCode($this->a);
        $logs = ActivityLog::count();
        $events = DB::table('device_assignment_events')->count();
        $alerts = AlertHistory::count();
        ActivityLog::creating(function ($log) {
            if ($log->action === 'Deleted Farm') {
                throw new \RuntimeException('Isolated rollback fixture');
            }
        });
        try {
            $this->deleteJson('/api/superadmin/farms/'.$this->a->id, $this->deletionConfirmations(['code' => $code]))->assertStatus(500);
        } finally {
            ActivityLog::flushEventListeners();
        }
        $this->assertNotNull($this->a->fresh());
        $this->assertNull($this->device->fresh()->farm_id);
        $this->assertSame($logs, ActivityLog::count());
        $this->assertSame($events, DB::table('device_assignment_events')->count());
        $this->assertSame($alerts, AlertHistory::count());
        $this->assertEquals($attributes, $reading->fresh()->getAttributes());
        $this->assertNull(Cache::get('farm-delete-otp:'.$this->admin->id.':'.$this->a->id));
    }

    public function test_existing_role_status_and_otp_rules_are_still_required(): void
    {
        $this->postJson('/api/superadmin/farms/'.$this->a->id.'/delete/otp/request')->assertStatus(422);
        $this->a->update(['status' => 'Deactivated']);
        $this->deleteJson('/api/superadmin/farms/'.$this->a->id, ['code' => '123456'])->assertStatus(422);
        $staff = $this->user('admin');
        $this->actingAs($staff, 'sanctum')->deleteJson('/api/superadmin/farms/'.$this->a->id, ['code' => '123456'])
            ->assertStatus(403);
        $this->assertSame($this->a->id, $this->device->fresh()->farm_id);
        $this->assertSame(1, DB::table('device_assignment_events')->count());
    }

    public function test_last_farm_owner_policy_does_not_delete_privileged_accounts(): void
    {
        $staff = $this->user('admin');
        $vet = $this->user('vet');
        $owner = $this->user('farm_owner');
        $farm = Farm::create(['user_id' => $owner->id, 'farm_name' => 'Disposable only farm',
            'owner_name' => $owner->full_name, 'mobile_number' => $owner->mobile_number, 'status' => 'Deactivated']);
        $device = $this->device('Disposable D03', $farm);
        app(DeviceAssignmentService::class)->change($device->id, null);
        $code = $this->deletionCode($farm);
        $this->deleteJson('/api/superadmin/farms/'.$farm->id, $this->deletionConfirmations(['code' => $code]))->assertOk()->assertJsonPath('owner_deleted', true);
        $this->assertNull(User::find($owner->id));
        foreach ([$this->admin, $staff, $vet, $this->owner] as $user) {
            $this->assertNotNull($user->fresh());
        }
        $this->assertNull($device->fresh()->farm_id);
    }
}
