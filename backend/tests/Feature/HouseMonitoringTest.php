<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AlertHistory;
use App\Models\FarmSmsAlertState;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Services\DeviceAssignmentService;
use App\Services\HouseMonitoringService;
use App\Services\MonitoringAssessmentService;
use App\Services\PoultryHouseService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\Support\PoultryHouseManagementTestCase;

class HouseMonitoringTest extends PoultryHouseManagementTestCase
{
    private function setupHouses(int $count = 4): array
    {
        $farm = $this->createRegisteredFarm($count);

        return [$farm, DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('house_number')->pluck('id')->all()];
    }

    private function assign(Sensor $sensor, int $farm, int $house): Sensor
    {
        return app(DeviceAssignmentService::class)->assignHouse($this->admin, $sensor->id, $farm, $house, app(DeviceAssignmentService::class)->version($sensor->id));
    }

    private function ingest(Sensor $sensor, bool $critical = false): SensorReading
    {
        $this->postJson('/api/sensor-readings', ['device_key' => $sensor->device_key, 'ammonia_raw' => $critical ? 3000 : 100,
            'soil_raw' => 3500, 'temperature' => 80, 'humidity' => 99])->assertOk();

        return SensorReading::latest('id')->firstOrFail();
    }

    public function test_independent_states_coverage_and_connectivity_are_not_interchangeable(): void
    {
        [$farm, $houses] = $this->setupHouses();
        $active = $this->assign($this->device, $farm->id, $houses[0]);
        $inactive = $this->makeDevice('Inactive');
        $this->assign($inactive, $farm->id, $houses[1]);
        app(PoultryHouseService::class)->transition($this->admin, $farm->id, $houses[3], 'Inactive');
        $before = app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id);
        $this->assertSame(['No Readings Yet', 'Inactive', 'Not Monitored', 'Inactive'], array_column($before['rows'], 'state'));
        $this->assertSame(3, $before['coverage']['active_houses']);
        $this->assertSame(1, $before['coverage']['monitored_houses']);
        $this->assertSame(0, $before['connectivity']['online']);
        $this->assertSame(1, $before['connectivity']['awaiting_first_reading']);
        $reading = $this->ingest($active);
        $online = app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id);
        $this->assertSame('Safe', $online['rows'][0]['state']);
        $this->assertSame(1, $online['connectivity']['online']);
        $this->assertSame('Critical', $online['rows'][0]['current_reading']['temperature_status']);
        $this->assertSame('Safe', $online['farm_assessment']['condition']);
        $this->travel(3)->minutes();
        $offline = app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id);
        $this->assertSame('Offline', $offline['rows'][0]['state']);
        $this->assertNull($offline['rows'][0]['current_reading']);
        $this->assertSame($reading->id, $offline['rows'][0]['last_reading']['id']);
        $this->assertSame(1, $offline['coverage']['monitored_houses']);
        $this->assertSame(1, $offline['connectivity']['offline']);
    }

    public function test_worst_valid_primary_condition_and_incomplete_data_preserve_existing_policy(): void
    {
        [$farm, $houses] = $this->setupHouses(3);
        $first = $this->assign($this->device, $farm->id, $houses[0]);
        $second = $this->assign($this->makeDevice(), $farm->id, $houses[1]);
        $this->ingest($first, true);
        $this->ingest($second);
        $data = app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id);
        $this->assertSame('Critical', $data['farm_assessment']['condition']);
        $this->assertSame(['Critical', 'Safe', 'Not Monitored'], array_column($data['rows'], 'state'));
        $this->assertSame(app(MonitoringAssessmentService::class)->farm($farm), $data['farm_assessment']);
        $last = SensorReading::where('sensor_id', $second->id)->latest('id')->firstOrFail();
        $last->update(['moisture' => null]); // Synthetic incomplete measurement, never operational data.
        $data = app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id);
        $this->assertSame('Incomplete Data', $data['rows'][1]['state']);
        $this->assertSame('Critical', $data['farm_assessment']['severity']);
        $this->assertTrue($data['farm_assessment']['incomplete_data']);
    }

    public function test_move_return_and_replacement_preserve_house_history_and_separate_current_periods(): void
    {
        [$farm, $houses] = $this->setupHouses(2);
        [$other, $otherHouses] = $this->setupHouses(1);
        $sensor = $this->assign($this->device, $farm->id, $houses[0]);
        $old = $this->ingest($sensor, true);
        $attributes = $old->getAttributes();
        $this->assign($sensor, $farm->id, $houses[1]);
        $data = app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id);
        $this->assertSame(['Not Monitored', 'No Readings Yet'], array_column($data['rows'], 'state'));
        $this->assertNull($data['rows'][1]['current_reading']);
        $this->ingest($sensor);
        $this->assign($sensor, $farm->id, $houses[0]);
        $this->assertSame('No Readings Yet', app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id)['rows'][0]['state']);
        $return = $this->ingest($sensor);
        $this->assign($sensor, $other->id, $otherHouses[0]);
        $replacement = $this->assign($this->makeDevice(), $farm->id, $houses[0]);
        $this->assertSame('No Readings Yet', app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id)['rows'][0]['state']);
        $new = $this->ingest($replacement);
        $history = $this->getJson('/api/farms/'.$farm->id.'/house-readings?poultry_house_id='.$houses[0])->assertOk();
        $history->assertJsonPath('data.total', 3);
        $history->assertJsonPath('data.items.0.id', $new->id);
        $period = $this->getJson('/api/farms/'.$farm->id.'/house-readings?poultry_house_id='.$houses[0].'&assignment_event_id='.$old->assignment_event_id)->assertOk();
        $period->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.id', $old->id);
        $this->assertNotSame($old->assignment_event_id, $return->assignment_event_id);
        $this->assertEquals($attributes, $old->fresh()->getAttributes());
        $this->getJson('/api/farms/'.$other->id.'/house-readings?assignment_event_id='.$old->assignment_event_id)->assertNotFound();
    }

    public function test_legacy_history_is_unknown_and_is_never_inferred_after_house_selection(): void
    {
        [$farm, $houses] = $this->setupHouses(1);
        app(DeviceAssignmentService::class)->change($this->device->id, $farm->id);
        $legacy = $this->ingest($this->device);
        $this->assign($this->device, $farm->id, $houses[0]);
        $known = $this->ingest($this->device);
        $this->getJson('/api/farms/'.$farm->id.'/house-readings?poultry_house_id=unknown')->assertOk()
            ->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.house_name', 'House not recorded')->assertJsonPath('data.items.0.id', $legacy->id);
        $this->getJson('/api/farms/'.$farm->id.'/house-readings?poultry_house_id='.$houses[0])->assertOk()
            ->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.id', $known->id);
        $this->assertNull($legacy->fresh()->poultry_house_id);
    }

    public function test_unverified_farm_and_multi_farm_authorization_remain_read_only_and_credential_free(): void
    {
        $this->ingest($this->device);
        $foreign = $this->createRegisteredFarm(1, $this->user('farm_owner'));
        $this->actingAs($this->owner, 'sanctum');
        $response = $this->getJson('/api/farms/'.$this->a->id.'/house-monitoring')->assertOk();
        $response->assertJsonPath('data.coverage.known', false)->assertJsonPath('data.rows.0.house_name', 'House not recorded');
        $this->assertStringNotContainsString($this->device->device_key, $response->getContent());
        $this->getJson('/api/farms/'.$this->b->id.'/house-monitoring')->assertOk()->assertJsonCount(0, 'data.rows');
        foreach (['house-monitoring', 'house-readings'] as $path) {
            $this->getJson('/api/farms/'.$foreign->id.'/'.$path)->assertNotFound();
        }
        $this->getJson('/api/farmer/dashboard?farm_id='.$this->a->id)->assertOk()->assertJsonPath('data.house_monitoring.farm_id', $this->a->id);
        $this->actingAs($this->user('vet'), 'sanctum');
        $this->getJson('/api/farms/'.$this->a->id.'/house-monitoring')->assertOk();
        $this->a->update(['status' => 'Deactivated']);
        $this->getJson('/api/farms/'.$this->a->id.'/house-monitoring')->assertNotFound();
        $this->getJson('/api/farms/'.$this->a->id.'/house-readings')->assertNotFound();
    }

    public function test_history_pagination_dates_and_cross_house_filters_do_not_leak_other_periods(): void
    {
        [$farm, $houses] = $this->setupHouses(2);
        $sensor = $this->assign($this->device, $farm->id, $houses[0]);
        for ($i = 0; $i < 12; $i++) {
            $this->ingest($sensor);
        }
        $period = $sensor->fresh()->current_assignment_event_id;
        $url = '/api/farms/'.$farm->id.'/house-readings';
        $this->getJson($url.'?page=2&per_page=10')->assertOk()->assertJsonCount(2, 'data.items')->assertJsonPath('data.current_page', 2);
        $this->getJson($url.'?to='.now()->setTimezone('Asia/Manila')->format('Y-m-d'))->assertOk()->assertJsonPath('data.total', 12);
        $this->getJson($url.'?poultry_house_id='.$houses[1].'&assignment_event_id='.$period)->assertNotFound();
        $this->getJson($url.'?per_page=100000')->assertUnprocessable();
        $this->getJson($url.'?from=2026-11-02&to=2026-11-01')->assertUnprocessable();
    }

    public function test_read_endpoints_cannot_change_sms_history_or_mutate_observations(): void
    {
        [$farm, $houses] = $this->setupHouses(1);
        $this->assign($this->device, $farm->id, $houses[0]);
        $reading = $this->ingest($this->device, true);
        $before = [ActivityLog::count(), AlertHistory::all()->toArray(), FarmSmsAlertState::all()->toArray(), $reading->getAttributes()];
        foreach ([$this->admin, $this->user('admin'), $this->user('vet'), $this->owner] as $actor) {
            $this->actingAs($actor, 'sanctum');
            $this->getJson('/api/farms/'.$farm->id.'/house-monitoring')->assertOk();
            $this->getJson('/api/farms/'.$farm->id.'/house-readings')->assertOk();
        }
        $this->assertEquals($before, [ActivityLog::count(), AlertHistory::all()->toArray(), FarmSmsAlertState::all()->toArray(), $reading->fresh()->getAttributes()]);
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }
}
