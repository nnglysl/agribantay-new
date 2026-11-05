<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\GeneratedReport;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use App\Services\FarmStatusService;
use App\Services\MonitoringAssessmentService;
use App\Services\ReadingSummaryService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class Phase101MonitoringTest extends TestCase
{
    private bool $transaction = false;

    private Farm $farm;

    private User $staff;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('PHASE101_TEST_MYSQL') !== '1') {
            $this->markTestSkipped('Private document fixture required.');
        }
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.mysql.host'), ['127.0.0.1', 'localhost', '::1']);
        DB::beginTransaction();
        $this->transaction = true;
        $this->travelTo(Carbon::parse('2026-11-01 04:00:00', 'UTC'));
        config(['logging.default' => 'null']);
        Http::preventStrayRequests();
        Http::fake();
        Mail::fake();
        $this->staff = User::where('role', 'admin')->firstOrFail();
        $this->owner = User::where('role', 'farm_owner')->firstOrFail();
        $this->actingAs($this->staff, 'sanctum');
        $this->farm = Farm::create(['user_id' => $this->owner->id, 'owner_name' => 'Synthetic Owner', 'mobile_number' => $this->owner->mobile_number,
            'address' => 'Synthetic address', 'farm_name' => 'Completeness '.Str::random(8), 'farm_size' => 'Small', 'status' => 'Active', 'barangay' => 'Calansayan']);
    }

    protected function tearDown(): void
    {
        if ($this->transaction) {
            DB::rollBack();
        } $this->travelBack();
        parent::tearDown();
    }

    public static function cases(): array
    {
        return [
            'complete safe' => [0, 0, 'Safe', 'Safe', 'Safe', false],
            'complete warning' => [18, 12, 'Warning', 'Safe', 'Warning', false],
            'complete critical' => [45, 12, 'Critical', 'Safe', 'Critical', false],
            'missing ammonia safe' => [null, 12, 'Critical', 'Safe', 'Incomplete Data', true],
            'missing moisture safe' => [5, null, 'Safe', 'Critical', 'Incomplete Data', true],
            'missing ammonia warning' => [null, 28, 'Critical', 'Warning', 'Warning', true],
            'missing moisture warning' => [18, null, 'Warning', 'Critical', 'Warning', true],
            'missing ammonia critical' => [null, 67, 'Safe', 'Critical', 'Critical', true],
            'missing moisture critical' => [45, null, 'Critical', 'Safe', 'Critical', true],
            'both missing' => [null, null, 'Critical', 'Critical', 'No Readings Yet', true],
        ];
    }

    private function sample($a, $m, string $as = 'Safe', string $ms = 'Safe'): array
    {
        $sensor = Sensor::create(['label' => 'PRIMARY-'.Str::random(8), 'device_key' => (string) Str::uuid(), 'status' => 'Active']);
        app(DeviceAssignmentService::class)->change($sensor->id, $this->farm->id);
        $reading = SensorReading::create(['farm_id' => $this->farm->id, 'sensor_id' => $sensor->id, 'ammonia' => $a, 'moisture' => $m,
            'ammonia_status' => $as, 'moisture_status' => $ms, 'temperature' => 99, 'humidity' => 99, 'temperature_status' => 'Critical', 'humidity_status' => 'Critical']);
        $sensor->update(['last_seen_at' => now()]);

        return [$sensor->fresh(), $reading->fresh()];
    }

    #[DataProvider('cases')]
    public function test_primary_completeness_is_consistent_across_current_apis_reports_and_print($a, $m, $as, $ms, $condition, $incomplete): void
    {
        [$sensor,$reading] = $this->sample($a, $m, $as, $ms);
        $before = $reading->getAttributes();
        $service = app(MonitoringAssessmentService::class);
        $this->assertSame($condition, $service->reading($reading)['condition']);
        $this->assertSame($incomplete, $service->farm($this->farm)['incomplete_data']);
        $this->assertSame($condition, app(FarmStatusService::class)->displayStatus($this->farm));
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/farmer/dashboard?farm_id='.$this->farm->id)->assertOk()
            ->assertJsonPath('data.health_status', $condition)->assertJsonPath('data.devices.0.primary_assessment.incomplete_data', $incomplete);
        $this->actingAs($this->staff, 'sanctum')->getJson('/api/admin/farms/'.$this->farm->id)->assertOk()
            ->assertJsonPath('data.display_status', $condition)->assertJsonPath('data.device_list.0.primary_assessment.incomplete_data', $incomplete);
        $dashboard = $this->getJson('/api/admin/dashboard')->assertOk()->json('data');
        $critical = collect($dashboard['critical_farms'])->firstWhere('farm_id', $this->farm->id);
        if ($condition === 'Critical') {
            $this->assertSame($incomplete, $critical['monitoring_assessment']['incomplete_data']);
        } else {
            $this->assertNull($critical);
        }
        $p = $this->postJson('/api/admin/farms/'.$this->farm->id.'/print-preview', ['sections' => ['monitoring', 'readings'], 'date_mode' => 'all'])->assertOk()->json('data');
        $this->assertSame($condition, $p['snapshots']['monitoring'][0]['current_condition']);
        $this->assertSame($condition, $p['snapshots']['monitoring_assessment']['condition']);
        $this->postJson('/api/admin/farms/'.$this->farm->id.'/print-batch', ['ticket' => $p['ticket'], 'section' => 'readings', 'after_id' => 0])->assertOk()
            ->assertJsonPath('data.items.0.primary_assessment.incomplete_data', $incomplete);
        $history = app(ReadingSummaryService::class)->forFarm($this->farm->id);
        $this->assertSame($condition, $history[0]['rows'][0]['status']);
        $this->assertSame($incomplete, $history[0]['rows'][0]['incomplete_data']);
        $report = $this->getJson('/api/admin/reports?from=2026-11-01&to=2026-11-01')->assertOk()->json('data');
        $key = ['Safe' => 'normal', 'Warning' => 'warning', 'Critical' => 'critical', 'Incomplete Data' => 'incomplete_data', 'No Readings Yet' => 'no_readings_yet'][$condition];
        $this->assertSame(1, $report['overview_summary']['farm_status_breakdown'][$key]);
        $this->assertSame((int) $incomplete, $report['reading_data_completeness']['incomplete_readings']);
        $criticalReading = (int) (($a !== null && $as === 'Critical') || ($m !== null && $ms === 'Critical'));
        $this->assertSame($criticalReading, $report['alert_summary']['critical_alerts']);
        $id = $this->postJson('/api/admin/generated-reports', ['report_name' => 'Synthetic completeness', 'period_start' => '2026-11-01', 'period_end' => '2026-11-01', 'report_type' => 'Daily'])->assertCreated()->json('data.id');
        $snapshot = GeneratedReport::findOrFail($id)->snapshot;
        $this->assertSame(1, $snapshot['farm_overview'][$key]);
        $this->assertSame((int) $incomplete, $snapshot['reading_data_completeness']['incomplete_readings']);
        $this->assertSame($criticalReading, $snapshot['alert_summary']['critical_alerts']);
        $this->assertSame($before, $reading->fresh()->getAttributes());
    }

    public function test_mixed_devices_keep_the_worst_valid_severity_and_complete_coverage_separate(): void
    {
        $this->sample(5, 12);
        [$offline] = $this->sample(45, 67, 'Critical', 'Critical');
        $offline->update(['last_seen_at' => now()->subMinutes(4)]);
        $this->sample(null, 28, 'Critical', 'Warning');
        $a = app(MonitoringAssessmentService::class)->farm($this->farm);
        $this->assertSame('Warning', $a['condition']);
        $this->assertTrue($a['incomplete_data']);
        $this->assertSame(1, $a['complete_devices']);
        $this->assertSame(3, $a['total_devices']);
        $this->assertSame(1, $a['offline_devices']);
        $this->sample(45, null, 'Critical', 'Safe');
        $this->assertSame('Critical', app(FarmStatusService::class)->displayStatus($this->farm));
    }

    public function test_offline_pending_setup_and_safe_with_an_unavailable_other_device(): void
    {
        $this->assertSame('Pending Setup', app(FarmStatusService::class)->displayStatus($this->farm));
        [$sensor] = $this->sample(5, 12);
        $sensor->update(['last_seen_at' => now()->subMinutes(4)]);
        $this->assertSame('Offline', app(FarmStatusService::class)->displayStatus($this->farm));
        $this->sample(5, 12);
        $this->assertSame('Incomplete Data', app(FarmStatusService::class)->displayStatus($this->farm));
    }

    public function test_ingestion_does_not_treat_a_carried_moisture_status_as_a_measurement(): void
    {
        [$sensor,$old] = $this->sample(5, 67, 'Safe', 'Critical');
        $before = $old->getAttributes();
        $this->postJson('/api/sensor-readings', ['device_key' => $sensor->device_key, 'ammonia_raw' => 100, 'soil_raw' => 0, 'temperature' => 28, 'humidity' => 60])->assertOk();
        $this->assertSame('Incomplete Data', app(FarmStatusService::class)->displayStatus($this->farm));
        $this->assertNull(SensorReading::latest('id')->firstOrFail()->moisture);
        $this->assertSame($before, $old->fresh()->getAttributes());
    }

    public function test_super_admin_is_protected_without_blocking_profile_updates_or_exposing_a_creation_route(): void
    {
        $super = User::where('role', 'super_admin')->firstOrFail();
        foreach (['deactivate', 'demote', 'delete'] as $action) {
            $target = $super->fresh();
            $before = hash('sha256', json_encode($target->getAttributes()));
            try {
                if ($action === 'delete') {
                    $target->delete();
                } else {
                    $target->update($action === 'demote' ? ['role' => 'admin'] : ['status' => 'inactive']);
                } $this->fail('Protected mutation must fail.');
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('account', $e->errors());
            }
            $this->assertSame($before, hash('sha256', json_encode($super->fresh()->getAttributes())));
        }
        $this->actingAs($super, 'sanctum')->postJson('/api/superadmin/accounts', ['full_name' => 'Synthetic extra', 'role' => 'super_admin', 'email' => 'extra@example.test'])->assertUnprocessable();
        $this->patchJson('/api/superadmin/accounts/'.$super->id.'/deactivate')->assertNotFound();
        $this->putJson('/api/settings/profile', ['first_name' => 'Synthetic', 'last_name' => 'Protected', 'mobile_number' => $super->mobile_number])->assertOk();
        $this->assertSame('super_admin', $super->fresh()->role);
        $this->assertSame('active', $super->fresh()->status);
    }
}
