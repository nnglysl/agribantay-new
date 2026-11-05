<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\PoultryHouseManagementTestCase;

class PoultryHouseInstallationCompatibilityTest extends PoultryHouseManagementTestCase
{
    protected bool $installFoundation = false;

    public function test_unmigrated_schema_keeps_reads_usable_and_blocks_registration_before_any_write(): void
    {
        $before = [User::count(), Farm::count(), DB::table('activity_logs')->count()];
        $this->getJson('/api/farms/'.$this->a->id.'/poultry-houses')->assertOk()
            ->assertJsonPath('data.available', false)->assertJsonCount(0, 'data.houses');
        $this->postJson('/api/farms/'.$this->a->id.'/poultry-houses', ['request_id' => (string) Str::uuid()])->assertStatus(503);
        $this->postJson('/api/admin/farm-owners', $this->registrationPayload())->assertStatus(503)->assertSee('No registration changes');
        $this->assertSame($before, [User::count(), Farm::count(), DB::table('activity_logs')->count()]);
        $this->assertSame($this->a->id, $this->device->fresh()->farm_id);
    }

    public function test_unmigrated_assignment_is_blocked_but_legacy_status_ingestion_and_manual_unassignment_work(): void
    {
        $before = DB::table('device_assignment_events')->count();
        $this->patchJson('/api/admin/sensors/'.$this->device->id.'/assign', ['farm_id' => $this->b->id,
            'poultry_house_id' => 1, 'expected_assignment_version' => 1])->assertStatus(503);
        $this->assertSame($before, DB::table('device_assignment_events')->count());
        $this->getJson('/api/admin/sensors')->assertOk()->assertJsonPath('data.0.house_name', null);
        $this->putJson('/api/admin/sensors/'.$this->device->id, ['status' => 'Inactive'])->assertOk();
        $this->putJson('/api/admin/sensors/'.$this->device->id, ['status' => 'Active'])->assertOk();
        $this->postJson('/api/sensor-readings', ['device_key' => $this->device->device_key,
            'ammonia_raw' => 100, 'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60])->assertOk();
        $this->patchJson('/api/admin/sensors/'.$this->device->id.'/unassign', ['expected_assignment_version' => app(DeviceAssignmentService::class)->version($this->device->id)])->assertOk();
        $this->assertNull($this->device->fresh()->farm_id);
    }

    public function test_house_monitoring_reads_legacy_schema_without_claiming_a_house_inventory(): void
    {
        $this->postJson('/api/sensor-readings', ['device_key' => $this->device->device_key,
            'ammonia_raw' => 100, 'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60])->assertOk();
        $this->getJson('/api/farms/'.$this->a->id.'/house-monitoring')->assertOk()
            ->assertJsonPath('data.coverage.known', false)->assertJsonPath('data.rows.0.house_name', 'House not recorded');
        $this->getJson('/api/farms/'.$this->a->id.'/house-readings?poultry_house_id=unknown')->assertOk()
            ->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.house_name', 'House not recorded');
    }
}
