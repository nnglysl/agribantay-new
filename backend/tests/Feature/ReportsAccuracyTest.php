<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\GeneratedReport;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\AlertHistoryService;
use App\Services\GeneratedReportService;
use App\Support\LocalTime;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/** All writes are new fixtures inside a rolled-back transaction. */
class ReportsAccuracyTest extends TestCase
{
    use DatabaseTransactions;

    private User $head;

    private Farm $farm;

    private Sensor $device;

    protected function setUp(): void
    {
        parent::setUp();
        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with DB_CONNECTION=mysql DB_DATABASE=db_agribantay.');
        }
        Http::fake();
        Mail::fake();
        $this->travelTo(Carbon::parse('2026-10-20 04:00:00', 'UTC'));
        $this->head = $this->user('super_admin');
        $owner = $this->user('farm_owner');
        $this->farm = Farm::forceCreate([
            'user_id' => $owner->id, 'farm_name' => 'Report '.Str::random(10),
            'owner_name' => $owner->full_name, 'mobile_number' => $owner->mobile_number,
            'barangay' => 'Aya', 'address' => 'Test', 'farm_size' => 'Small', 'status' => 'Active',
            'created_at' => '2001-01-01 00:00:00',
        ]);
        $this->device = Sensor::create([
            'farm_id' => $this->farm->id, 'label' => 'RPT-'.Str::random(8),
            'device_key' => 'RPT-'.Str::random(12), 'status' => 'Active',
        ]);
    }

    private function user(string $role): User
    {
        return User::create([
            'first_name' => 'Report', 'last_name' => Str::random(8),
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password' => bcrypt('test'), 'status' => 'active', 'role' => $role,
        ]);
    }

    private function asUser(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($user);
    }

    private function report(array $dates = ['from' => '2001-02-01', 'to' => '2001-02-28']): array
    {
        return $this->asUser($this->head)->getJson('/api/admin/reports?'.http_build_query($dates))
            ->assertOk()->json('data');
    }

    private function alert(string $at = '2001-02-05 01:00:00', array $extra = []): AlertHistory
    {
        return AlertHistory::create(array_merge([
            'farm_id' => $this->farm->id, 'sensor_id' => $this->device->id,
            'sensor_type' => 'ammonia', 'status' => 'Critical', 'value' => 40,
            'triggered_at' => $at,
        ], $extra));
    }

    private function inspection(array $extra = []): Inspection
    {
        return Inspection::forceCreate(array_merge([
            'farm_id' => $this->farm->id, 'inspection_number' => 'RPT-'.Str::random(10),
            'inspection_type' => 'General Inspection', 'status' => 'Completed',
            'scheduled_at' => '2001-01-15 00:00:00', 'completed_at' => '2001-02-05 01:00:00',
        ], $extra));
    }

    private function service(array $extra = []): ServiceRequest
    {
        return ServiceRequest::forceCreate(array_merge([
            'farm_id' => $this->farm->id, 'request_number' => 'RPT-'.Str::random(10),
            'requested_by' => $this->farm->user_id, 'service_type' => 'Odor Control Request',
            'status' => 'Completed', 'created_at' => '2001-01-15 00:00:00',
            'scheduled_at' => '2001-01-25 00:00:00', 'completed_at' => '2001-02-05 01:00:00',
        ], $extra));
    }

    public function test_cards_series_and_tables_count_all_incidents_beyond_the_old_300_row_cap(): void
    {
        $rows = [];
        for ($i = 0; $i < 321; $i++) {
            $rows[] = [
                'farm_id' => $this->farm->id, 'sensor_id' => $this->device->id,
                'sensor_type' => $i % 2 === 0 ? 'ammonia' : 'moisture',
                'status' => $i % 3 === 0 ? 'Critical' : 'Warning', 'value' => 40,
                'triggered_at' => Carbon::parse('2001-02-05 01:00:00')->addMinutes($i),
                'resolved_at' => $i % 2 === 0 ? '2001-02-06 01:00:00' : null,
            ];
        }
        AlertHistory::insert($rows);
        SensorReading::create(['farm_id' => $this->farm->id, 'sensor_id' => $this->device->id,
            'ammonia' => 100, 'ammonia_status' => 'Critical', 'is_mock' => true]);
        $data = $this->report();
        $summary = $data['alert_summary'];
        $this->assertSame(321, $summary['total_incidents']);
        $this->assertSame(161, $summary['ammonia_incidents']);
        $this->assertSame(160, $summary['moisture_incidents']);
        $this->assertSame(107, $summary['critical_incidents']);
        $this->assertSame(161, $summary['resolved_incidents']);
        $this->assertCount(321, $data['alert_records']);
        $this->assertSame(321, array_sum(array_column($data['alert_trend']['buckets'], 'count')));
        $this->assertSame('day', $data['alert_trend']['aggregation']);
        $this->assertCount(28, $data['alert_trend']['buckets']);
        $this->assertSame($this->farm->id, $data['alert_records'][0]['farm_id']);
        $this->assertSame($this->device->id, $data['alert_records'][0]['sensor_id']);
    }

    public function test_manila_month_boundaries_and_resolution_cutoff_are_consistent(): void
    {
        $this->alert('2001-01-31 15:59:59');
        $first = $this->alert('2001-01-31 16:00:00', ['resolved_at' => '2001-03-01 01:00:00']);
        $last = $this->alert('2001-02-28 15:59:59', ['sensor_type' => 'moisture', 'resolved_at' => '2001-02-28 15:59:59']);
        $this->alert('2001-02-28 16:00:00');
        $data = $this->report();
        $this->assertSame(2, $data['alert_summary']['total_incidents']);
        $this->assertSame(1, $data['alert_summary']['resolved_incidents']);
        $this->assertSame([$last->id, $first->id], array_column($data['alert_records'], 'id'));
        $this->assertNull($data['alert_records'][1]['resolved_at']);
        $this->assertTrue($data['alert_records'][1]['is_ongoing']);
        $this->assertSame('2001-02-01', $data['alert_trend']['buckets'][0]['key']);
        $this->assertSame(1, $data['alert_trend']['buckets'][0]['count']);
        $this->assertSame(1, $data['alert_trend']['buckets'][27]['count']);
    }

    public function test_all_records_are_cumulative_and_years_use_monthly_incident_buckets(): void
    {
        $this->alert('2000-12-31 16:00:00');
        $this->alert('2000-12-31 15:59:59');
        $all = $this->report([]);
        $this->assertSame(AlertHistory::count(), $all['alert_summary']['total_incidents']);
        $this->assertSame(AlertHistory::count(), $all['alert_trend']['total']);
        $this->assertSame('month', $all['alert_trend']['aggregation']);
        $year = $this->report(['from' => '2001-01-01', 'to' => '2001-12-31']);
        $this->assertSame(1, $year['alert_summary']['total_incidents']);
        $this->assertSame('month', $year['alert_trend']['aggregation']);
        $this->assertCount(12, $year['alert_trend']['buckets']);
        $this->assertSame('2001-01', $year['alert_trend']['buckets'][0]['key']);
    }

    public function test_empty_dates_and_invalid_ranges_are_handled_without_invented_chart_data(): void
    {
        $empty = $this->report(['from' => '1900-01-01', 'to' => '1900-01-31']);
        $this->assertSame(0, $empty['alert_summary']['total_incidents']);
        $this->assertSame([], $empty['alert_trend']['buckets']);
        foreach (['/api/admin/reports', '/api/vet/reports'] as $path) {
            $this->asUser($this->head)->getJson($path.'?from=2001-03-01&to=2001-02-01')->assertStatus(422);
            $this->getJson($path.'?from=not-a-date')->assertStatus(422);
        }
    }

    public function test_inspections_use_completion_dates_and_scheduled_dates_as_appropriate(): void
    {
        $completed = $this->inspection();
        $this->inspection(['scheduled_at' => '2001-02-05 01:00:00', 'completed_at' => '2001-03-05 01:00:00']);
        $this->inspection(['status' => 'Scheduled', 'scheduled_at' => '2001-02-10 01:00:00', 'completed_at' => null]);
        $this->inspection(['status' => 'Cancelled', 'scheduled_at' => '2001-02-11 01:00:00', 'completed_at' => null]);
        $this->service();
        $this->service(['completed_at' => '2001-03-05 01:00:00']);
        $this->service(['status' => 'Scheduled', 'scheduled_at' => '2001-02-10 01:00:00', 'completed_at' => null]);
        $this->service(['status' => 'Pending', 'created_at' => '2001-02-10 01:00:00', 'completed_at' => null]);
        $data = $this->report();
        $this->assertSame(3, $data['inspection_summary']['total']);
        $this->assertSame(1, $data['inspection_summary']['completed']);
        $this->assertSame(1, $data['inspection_summary']['scheduled']);
        $this->assertSame([$completed->id], array_column($data['completed_inspections'], 'id'));
        $this->assertArrayNotHasKey('service_summary', $data);
        $this->assertArrayNotHasKey('completed_services', $data);
        $this->assertArrayNotHasKey('service_records', $data);
        $snapshot = app(GeneratedReportService::class)->buildSnapshot(
            LocalTime::startOfLocalDay('2001-02-01'), LocalTime::endOfLocalDay('2001-02-28'));
        $this->assertSame($data['inspection_summary']['completed'], $snapshot['inspection_period']['completed']);
    }

    public function test_veterinary_filters_preserve_own_assignee_scope_and_super_admin_oversight(): void
    {
        $vet = $this->user('vet');
        $otherVet = $this->user('vet');
        $this->service(['service_type' => 'Blood Test Request', 'accepted_by' => $vet->id]);
        $this->service(['service_type' => 'Farm Biosecurity Request', 'accepted_by' => $otherVet->id]);
        $this->service(['service_type' => 'Blood Test Request', 'accepted_by' => $vet->id, 'completed_at' => '2001-03-01 01:00:00']);
        $url = '/api/vet/reports?from=2001-02-01&to=2001-02-28';
        $own = $this->asUser($vet)->getJson($url)->assertOk()->json('data');
        $this->assertSame(1, $own['total_completed']);
        $this->assertCount(1, $own['completed_services']);
        $this->asUser($this->head)->getJson($url)->assertOk()->assertJsonPath('data.total_completed', 2);
        $this->assertArrayNotHasKey('service_summary', $this->report());
        $this->asUser($vet)->getJson('/api/admin/reports')->assertForbidden();
        $this->asUser($this->user('admin'))->getJson('/api/vet/reports')->assertForbidden();
        $this->asUser($this->farm->user)->getJson('/api/admin/reports')->assertForbidden();
    }

    public function test_maintenance_counts_are_period_scoped_and_not_truncated_at_200_rows(): void
    {
        $rows = array_fill(0, 205, ['farm_id' => $this->farm->id, 'maintenance_type' => 'Full Manure Clean-out', 'performed_at' => '2001-02-01', 'photo_path' => 'report-test.jpg']);
        MaintenanceLog::insert($rows);
        MaintenanceLog::create(['farm_id' => $this->farm->id, 'maintenance_type' => 'Full Manure Clean-out', 'performed_at' => '2001-01-31', 'photo_path' => 'report-test.jpg']);
        $data = $this->report();
        $this->assertSame(205, $data['maintenance_summary']['completed_this_month']);
        $this->assertCount(205, $data['maintenance_completed_list']);
        $this->assertSame('2001-02-01', $data['maintenance_completed_list'][0]['performed_at_raw']);
    }

    public function test_repeated_abnormal_readings_stay_in_one_incident_and_three_safe_readings_resolve_it(): void
    {
        $service = app(AlertHistoryService::class);
        $at = Carbon::parse('2001-02-05 01:00:00');
        foreach (['Critical', 'Critical', 'Warning', 'Critical'] as $i => $status) {
            $service->recordReading($this->farm->id, 'ammonia', $status, 40, $at->copy()->addMinutes($i), $this->device->id);
        }
        $incidents = fn () => AlertHistory::where('farm_id', $this->farm->id)->where('sensor_id', $this->device->id);
        $this->assertSame(1, $incidents()->count());
        foreach ([4, 5] as $minute) {
            $service->recordReading($this->farm->id, 'ammonia', 'Safe', 4, $at->copy()->addMinutes($minute), $this->device->id);
        }
        $this->assertNull($incidents()->first()->resolved_at);
        $service->recordReading($this->farm->id, 'ammonia', 'Safe', 4, $at->copy()->addMinutes(6), $this->device->id);
        $this->assertNotNull($incidents()->first()->resolved_at);
        $service->recordReading($this->farm->id, 'ammonia', 'Critical', 40, $at->copy()->addMinutes(7), $this->device->id);
        $this->assertSame(2, $incidents()->count());
        $this->assertSame($this->farm->id, $incidents()->first()->farm_id);
        Http::assertNothingSent();
        Mail::assertNothingOutgoing();
    }

    public function test_generation_retains_daily_weekly_monthly_custom_types_and_never_overwrites_archives(): void
    {
        $before = GeneratedReport::orderBy('id')->get()->keyBy('id')->toArray();
        foreach ([['Daily', '2001-02-01', '2001-02-01'], ['Weekly', '2001-02-02', '2001-02-08'], ['Monthly', '2001-03-01', '2001-03-31'], ['Custom', '2001-04-05', '2001-05-06']] as [$type, $from, $to]) {
            $this->asUser($this->head)->postJson('/api/admin/generated-reports', [
                'report_name' => 'Same report name', 'period_start' => $from, 'period_end' => $to, 'report_type' => $type,
            ])->assertCreated();
        }
        $this->assertSame(count($before) + 4, GeneratedReport::count());
        foreach ($before as $id => $row) {
            $this->assertSame($row, GeneratedReport::findOrFail($id)->toArray());
        }
        $this->postJson('/api/admin/generated-reports', [
            'report_name' => 'Same report name', 'period_start' => '2001-02-01', 'period_end' => '2001-02-01', 'report_type' => 'Daily',
        ])->assertStatus(409);
    }

    public function test_ongoing_report_stops_at_generation_time_and_is_immutable_when_new_records_arrive(): void
    {
        $inside = $this->alert('2026-10-20 03:59:59');
        $future = $this->alert('2026-10-20 04:00:01');
        $id = $this->asUser($this->head)->postJson('/api/admin/generated-reports', [
            'report_name' => 'October 2026 Report', 'period_start' => '2026-10-01', 'period_end' => '2026-10-31', 'report_type' => 'Monthly',
        ])->assertCreated()->json('data.id');
        $report = GeneratedReport::findOrFail($id);
        $this->assertSame('October 2026 Report (Oct 1–20)', $report->report_name);
        $this->assertSame('2026-10-20T04:00:00+00:00', $report->snapshot['coverage']['end']);
        $ids = array_column($report->snapshot['alert_records'], 'id');
        $this->assertContains($inside->id, $ids);
        $this->assertNotContains($future->id, $ids);
        $original = $report->snapshot;
        $this->alert('2026-10-20 03:59:58');
        $this->getJson('/api/admin/generated-reports/'.$id)->assertOk()->assertJsonPath('data.snapshot', $original);
        $this->asUser($this->user('admin'))->getJson('/api/admin/generated-reports/'.$id)->assertNotFound();
    }

    public function test_new_snapshots_keep_distinct_farms_with_identical_names_separate(): void
    {
        $second = Farm::forceCreate(array_merge($this->farm->only(['user_id', 'farm_name', 'owner_name', 'mobile_number', 'barangay', 'address', 'farm_size', 'status']), ['created_at' => '2001-01-01']));
        $this->alert();
        $this->alert('2001-02-05 02:00:00', ['farm_id' => $second->id, 'sensor_id' => null]);
        $snapshot = app(GeneratedReportService::class)->buildSnapshot(
            LocalTime::startOfLocalDay('2001-02-01'), LocalTime::endOfLocalDay('2001-02-28'));
        $this->assertCount(2, $snapshot['alert_farm_summary']);
        $this->assertSame(2, $snapshot['alert_period']['total']);
    }

    public function test_raw_reading_statistics_are_separate_from_incidents_and_scoped_to_the_period(): void
    {
        foreach ([['Critical', 'Safe'], ['Safe', 'Critical'], ['Safe', 'Safe']] as [$ammonia, $moisture]) {
            SensorReading::forceCreate([
                'farm_id' => $this->farm->id, 'sensor_id' => $this->device->id,
                'ammonia' => 40, 'moisture' => 40, 'ammonia_status' => $ammonia,
                'moisture_status' => $moisture, 'temperature_status' => 'Critical',
                'created_at' => '2001-02-05 01:00:00',
            ]);
        }
        SensorReading::forceCreate([
            'farm_id' => $this->farm->id, 'sensor_id' => $this->device->id,
            'ammonia_status' => 'Critical', 'created_at' => '2001-03-05 01:00:00',
        ]);
        $data = $this->report();
        $this->assertSame(3, $data['alert_summary']['total']);
        $this->assertSame(2, $data['alert_summary']['critical_alerts']);
        $this->assertSame(0, $data['alert_summary']['total_incidents']);
        $snapshot = app(GeneratedReportService::class)->buildSnapshot(
            LocalTime::startOfLocalDay('2001-02-01'), LocalTime::endOfLocalDay('2001-02-28'));
        $this->assertSame(3, $snapshot['alert_summary']['total']);
        $this->assertSame(2, $snapshot['alert_summary']['critical_alerts']);
        $this->assertSame(0, $snapshot['alert_period']['total']);
    }

    public function test_vet_archives_preserve_municipal_veterinary_scope_and_hide_admin_blocks(): void
    {
        $vet = $this->user('vet');
        $this->service(['service_type' => 'Blood Test Request', 'accepted_by' => $vet->id]);
        $this->service(['service_type' => 'Blood Test Request', 'accepted_by' => $this->user('vet')->id]);
        $id = $this->asUser($vet)->postJson('/api/vet/generated-reports', [
            'report_name' => 'Municipal veterinary report', 'period_start' => '2001-02-01',
            'period_end' => '2001-02-28', 'report_type' => 'Monthly',
        ])->assertCreated()->json('data.id');
        $snapshot = $this->getJson('/api/vet/generated-reports/'.$id)->assertOk()->json('data.snapshot');
        $this->assertSame(2, $snapshot['vet_summary']['total_completed']);
        $this->assertCount(2, $snapshot['vet_services']);
        $this->assertArrayNotHasKey('inspection_period', $snapshot);
        $this->assertArrayNotHasKey('alert_records', $snapshot);
        $this->assertArrayHasKey('coverage', $snapshot);
        $this->asUser($this->head)->getJson('/api/vet/generated-reports/'.$id)->assertNotFound();
    }

    public function test_cleanout_status_in_early_manila_morning_includes_that_local_calendar_date(): void
    {
        $this->farm->forceFill(['created_at' => '1999-01-01 00:00:00'])->saveQuietly();
        $this->travelTo(Carbon::parse('2001-02-01 16:30:00', 'UTC')); // Feb 2, 12:30 AM PHT.
        MaintenanceLog::create(['farm_id' => $this->farm->id,
            'maintenance_type' => 'Full Manure Clean-out', 'performed_at' => '2001-02-02', 'photo_path' => 'report-test.jpg']);
        $data = $this->report(['from' => '2001-02-02', 'to' => '2001-02-02']);
        $this->assertSame(1, $data['maintenance_summary']['completed_this_month']);
        $this->assertSame(0, $data['maintenance_summary']['non_compliant']);
        $id = $this->asUser($this->head)->postJson('/api/admin/generated-reports', [
            'report_name' => 'Early morning report', 'period_start' => '2001-02-02',
            'period_end' => '2001-02-02', 'report_type' => 'Daily',
        ])->assertCreated()->json('data.id');
        $snapshot = GeneratedReport::findOrFail($id)->snapshot;
        $this->assertSame(1, $snapshot['compliance_period']['compliant']);
        $this->assertSame(1, $snapshot['maintenance_summary']['completed_this_month']);
    }
}
