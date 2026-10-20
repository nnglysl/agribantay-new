<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class MonitoringDisplayTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with DB_CONNECTION=mysql DB_DATABASE=db_agribantay; fixtures are rolled back.');
        }
        Http::fake();
        Mail::fake();
        $this->travelTo(Carbon::parse('2026-10-20 04:00:00', 'UTC'));
        $this->admin = $this->user('admin');
        $this->actingAs($this->admin);
    }

    private function user(string $role): User
    {
        return User::create([
            'first_name' => 'Monitoring', 'last_name' => Str::random(8),
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password' => bcrypt('test-password'), 'role' => $role, 'status' => 'active',
        ]);
    }

    private function farm(?string $name = null): Farm
    {
        $owner = $this->user('farm_owner');

        return Farm::create([
            'user_id' => $owner->id, 'farm_name' => $name ?? 'Monitoring '.Str::random(8),
            'owner_name' => $owner->full_name, 'mobile_number' => $owner->mobile_number,
            'barangay' => 'Aya', 'address' => 'Test', 'farm_size' => 'Small', 'status' => 'Active',
        ]);
    }

    private function device(?Farm $farm): Sensor
    {
        return Sensor::create([
            'farm_id' => $farm?->id, 'label' => 'MON-'.Str::random(8),
            'device_key' => 'MON-'.Str::random(12), 'status' => 'Active',
        ]);
    }

    private function event(Sensor $device, Farm $farm, string $at, bool $assign): ActivityLog
    {
        return ActivityLog::forceCreate([
            'user_id' => $this->admin->id, 'role' => 'admin', 'type' => 'Farm',
            'action' => $assign ? 'Assigned Sensor' : 'Unassigned Sensor',
            'details' => $assign
                ? "Assigned device {$device->device_name} to {$farm->farm_name}"
                : "Removed device {$device->device_name} from {$farm->farm_name}",
            'created_at' => $at, 'updated_at' => $at,
        ]);
    }

    private function reading(Farm $farm, Sensor $device, string $at, array $values = []): SensorReading
    {
        return SensorReading::forceCreate(array_merge([
            'farm_id' => $farm->id, 'sensor_id' => $device->id,
            'ammonia' => 4, 'moisture' => 10, 'temperature' => 24, 'humidity' => 60,
            'ammonia_status' => 'Safe', 'moisture_status' => 'Safe',
            'temperature_status' => 'Safe', 'humidity_status' => 'Safe',
            'is_mock' => false, 'created_at' => $at, 'updated_at' => $at,
        ], $values))->refresh();
    }

    private function summary(Farm $farm)
    {
        return collect($this->getJson("/api/admin/farms/{$farm->id}/readings-summary")
            ->assertOk()->json('data.deployments'));
    }

    public function test_current_values_and_last_condition_survive_the_exact_three_minute_offline_boundary(): void
    {
        $farm = $this->farm();
        $device = $this->device($farm);
        $this->assertSame(3, config('sensors.offline_after_minutes'));
        foreach (['Safe', 'Warning', 'Critical'] as $i => $status) {
            $at = '2026-10-20 03:59:0'.$i;
            $reading = $this->reading($farm, $device, $at, ['ammonia_status' => $status]);
            $device->update(['last_seen_at' => $at]);
            $row = $this->getJson("/api/admin/farms/{$farm->id}")->assertOk()->json('data.device_list.0');
            $this->assertTrue($row['has_reading']);
            $this->assertSame('Online', $row['connectivity']);
            $this->assertSame($status, $row['last_recorded_condition']);
        }
        $original = $reading->getAttributes();
        $alertCount = AlertHistory::count();
        $this->travelTo(Carbon::parse('2026-10-20 04:02:01', 'UTC'));
        $this->assertSame('Online', $device->fresh()->connectivity());
        $this->travelTo(Carbon::parse('2026-10-20 04:02:02', 'UTC'));
        $row = $this->getJson("/api/admin/farms/{$farm->id}")->assertOk()->json('data.device_list.0');
        $this->assertSame('Offline', $row['connectivity']);
        $this->assertSame('Critical', $row['last_recorded_condition']);
        $this->assertEquals(4, $row['ammonia']);
        $this->assertSame($reading->created_at->toIso8601String(), $row['last_reading_at']);
        $this->assertSame($original, $reading->fresh()->getAttributes());
        $this->assertSame($alertCount, AlertHistory::count());
        Http::assertNothingSent();
        Mail::assertNothingOutgoing();
    }

    public function test_new_assignment_does_not_show_previous_assignment_or_other_farm_readings(): void
    {
        $farm = $this->farm();
        $other = $this->farm();
        $device = $this->device($farm);
        $this->event($device, $farm, '2026-10-20 03:00:00', true);
        $this->reading($farm, $device, '2026-10-20 02:00:00');
        $this->reading($other, $device, '2026-10-20 03:59:00');
        $device->update(['last_seen_at' => '2026-10-20 03:59:00']);

        $row = $this->getJson("/api/admin/farms/{$farm->id}")->assertOk()->json('data.device_list.0');
        $this->assertFalse($row['has_reading']);
        $this->assertNull($row['last_reading_at']);
        $this->assertNull($row['last_recorded_condition']);
        $this->assertNull($row['ammonia']);
        $current = $this->summary($farm)->firstWhere('is_current', true);
        $this->assertSame(0, $current['total_readings']);
        $this->assertEquals(0, $current['data_coverage_percent']);
    }

    public function test_completed_assignment_uses_log_dates_not_first_or_last_reading(): void
    {
        $farm = $this->farm();
        $device = $this->device(null);
        $this->event($device, $farm, '2026-09-25 04:23:06', true);
        $this->event($device, $farm, '2026-09-30 06:00:00', false);
        $this->reading($farm, $device, '2026-09-26 00:00:00');
        $this->reading($farm, $device, '2026-09-29 02:00:00');
        $period = $this->summary($farm)->sole();

        $this->assertSame('2026-09-25T04:23:06+00:00', $period['assigned_at']);
        $this->assertSame('2026-09-30T06:00:00+00:00', $period['unassigned_at']);
        $this->assertSame(6, $period['days_covered']);
        $this->assertSame(2, $period['total_readings']);
        $this->assertFalse($period['is_current']);
        $this->assertTrue($period['assignment_dates_verified']);
        $this->assertNotSame($period['last_reading_at'], $period['unassigned_at']);
        $this->travelTo(Carbon::parse('2026-10-21 04:00:00', 'UTC'));
        $this->assertSame($period, $this->summary($farm)->sole());
    }

    public function test_active_coverage_uses_configured_intervals_and_deduplicates_sampling_slots(): void
    {
        $farm = $this->farm();
        $other = $this->farm();
        $device = $this->device($farm);
        $otherDevice = $this->device($farm);
        $this->event($device, $farm, '2026-10-20 03:50:00', true);
        foreach (['03:50:10', '03:50:10', '03:55:00'] as $time) {
            $this->reading($farm, $device, '2026-10-20 '.$time);
        }
        $this->reading($farm, $device, '2026-10-20 03:49:59');
        $this->reading($farm, $device, '2026-10-20 04:01:00');
        $this->reading($other, $device, '2026-10-20 03:51:00');
        $this->reading($farm, $otherDevice, '2026-10-20 03:52:00');
        $period = $this->summary($farm)->first(fn ($period) => $period['sensor_id'] === $device->id && $period['is_current']);
        $this->assertSame(3, $period['total_readings']);
        $this->assertSame(10, $period['expected_readings']);
        $this->assertSame(2, $period['received_sampling_slots']);
        $this->assertEquals(20, $period['data_coverage_percent']);

        config(['sensors.expected_sampling_interval_seconds' => 120]);
        $period = $this->summary($farm)->first(fn ($period) => $period['sensor_id'] === $device->id && $period['is_current']);
        $this->assertSame(5, $period['expected_readings']);
        $this->assertEquals(40, $period['data_coverage_percent']);
    }

    public function test_repeated_visits_and_unverified_gaps_keep_separate_daily_summaries(): void
    {
        $farm = $this->farm();
        $device = $this->device($farm);
        $this->event($device, $farm, '2026-10-20 00:00:00', true);
        $this->event($device, $farm, '2026-10-20 01:00:00', false);
        $this->event($device, $farm, '2026-10-20 02:00:00', true);
        $this->reading($farm, $device, '2026-10-20 00:30:00', ['ammonia' => 4]);
        $this->reading($farm, $device, '2026-10-20 01:30:00', ['ammonia' => 99]);
        $this->reading($farm, $device, '2026-10-20 02:30:00', ['ammonia' => 40]);
        $periods = $this->summary($farm);
        $this->assertCount(3, $periods);
        $this->assertCount(3, $periods->pluck('assignment_key')->unique());
        $this->assertSame(3, $periods->sum('total_readings'));
        $this->assertEquals(4, $periods[0]['rows'][0]['ammonia_avg']);
        $this->assertEquals(99, $periods[1]['rows'][0]['ammonia_avg']);
        $this->assertEquals(40, $periods[2]['rows'][0]['ammonia_avg']);
        $this->assertFalse($periods[0]['is_current']);
        $this->assertFalse($periods[1]['assignment_dates_verified']);
        $this->assertNull($periods[1]['data_coverage_percent']);
        $this->assertTrue($periods[2]['is_current']);
    }

    public function test_missing_or_ambiguous_assignment_events_do_not_fabricate_dates_or_coverage(): void
    {
        $farm = $this->farm('Duplicate '.Str::random(8));
        $this->farm($farm->farm_name);
        $device = $this->device($farm);
        $this->event($device, $farm, '2026-10-20 03:00:00', true);
        $this->reading($farm, $device, '2026-10-20 03:30:00');
        $period = $this->summary($farm)->sole();
        $this->assertTrue($period['is_current']);
        $this->assertNull($period['assigned_at']);
        $this->assertNull($period['unassigned_at']);
        $this->assertNull($period['days_covered']);
        $this->assertNull($period['data_coverage_percent']);
        $this->assertNotEmpty($period['period_note']);
    }

    public function test_short_and_empty_completed_assignment_is_retained(): void
    {
        $farm = $this->farm();
        $device = $this->device(null);
        $this->event($device, $farm, '2026-10-19 15:59:50', true);
        $this->event($device, $farm, '2026-10-19 16:00:10', false);
        $period = $this->summary($farm)->sole();
        $this->assertSame(2, $period['days_covered'], 'Assignment crosses midnight in Manila.');
        $this->assertSame(1, $period['expected_readings']);
        $this->assertSame(0, $period['total_readings']);
        $this->assertEquals(0, $period['data_coverage_percent']);
        $this->assertSame([], $period['rows']);
    }

    public function test_direct_reassignment_log_closes_the_old_farm_period_and_opens_the_new_one(): void
    {
        $first = $this->farm();
        $second = $this->farm();
        $device = $this->device(null);
        $this->travelTo(Carbon::parse('2026-10-20 03:00:00', 'UTC'));
        $this->patchJson("/api/admin/sensors/{$device->id}/assign", ['farm_id' => $first->id])->assertOk();
        $reading = $this->reading($first, $device, '2026-10-20 03:10:00');
        $original = $reading->getAttributes();
        $this->travelTo(Carbon::parse('2026-10-20 03:30:00', 'UTC'));
        $this->patchJson("/api/admin/sensors/{$device->id}/assign", ['farm_id' => $second->id])->assertOk();
        $this->reading($second, $device, '2026-10-20 03:40:00', ['ammonia' => 40]);
        $this->travelTo(Carbon::parse('2026-10-20 04:00:00', 'UTC'));

        $old = $this->summary($first)->sole();
        $new = $this->summary($second)->sole();
        $this->assertSame('2026-10-20T03:30:00+00:00', $old['unassigned_at']);
        $this->assertSame($old['unassigned_at'], $new['assigned_at']);
        $this->assertFalse($old['is_current']);
        $this->assertTrue($new['is_current']);
        $this->assertEquals(4, $old['rows'][0]['ammonia_avg']);
        $this->assertEquals(40, $new['rows'][0]['ammonia_avg']);
        $this->assertSame($original, $reading->fresh()->getAttributes());
    }

    public function test_missing_assignment_logs_keep_legacy_readings_without_assumed_installation_dates(): void
    {
        $farm = $this->farm();
        $device = $this->device($farm);
        $this->reading($farm, $device, '2026-10-19 03:00:00');
        $period = $this->summary($farm)->sole();
        $this->assertSame(1, $period['total_readings']);
        $this->assertNull($period['assigned_at']);
        $this->assertNull($period['data_coverage_percent']);
        $this->assertNull($period['days_covered']);
    }

    public function test_completed_period_ending_at_manila_midnight_does_not_count_the_following_day(): void
    {
        $farm = $this->farm();
        $device = $this->device(null);
        $this->event($device, $farm, '2026-10-19 15:50:00', true);
        $this->event($device, $farm, '2026-10-19 16:00:00', false);
        $period = $this->summary($farm)->sole();
        $this->assertSame(1, $period['days_covered']);
        $this->assertSame(10, $period['expected_readings']);
    }

    public function test_zero_duration_assignment_has_no_division_by_zero_or_invented_coverage(): void
    {
        $farm = $this->farm();
        $device = $this->device(null);
        $this->event($device, $farm, '2026-10-19 16:00:00', true);
        $this->event($device, $farm, '2026-10-19 16:00:00', false);
        $period = $this->summary($farm)->sole();
        $this->assertSame(0, $period['expected_readings']);
        $this->assertNull($period['data_coverage_percent']);
        $this->assertSame(0, $period['total_readings']);
    }
}
