<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\GeneratedReport;
use App\Models\Inspection;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\CurrentMonitoringService;
use App\Services\DeviceAssignmentService;
use App\Services\FarmStatusService;
use App\Services\MaintenanceStatusService;
use App\Services\RecommendationExplanationService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/** One HTTP workflow over private MySQL schema + synthetic records + temporary files. */
class PhaseTenWorkflowTest extends TestCase
{
    private bool $transaction = false;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('PHASE10_TEST_MYSQL') !== '1') {
            $this->markTestSkipped('Explicit private fixture required.');
        }
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.mysql.host'), ['127.0.0.1', 'localhost', '::1']);
        $this->assertTrue(Schema::hasTable('farm_control_documents'), 'Use the existing Phase 6 private document fixture.');
        DB::beginTransaction();
        $this->transaction = true;
        $this->travelTo(Carbon::parse('2026-11-01 04:00:00', 'UTC'));
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['message' => ['status' => 'pending', 'reference_id' => 'synthetic']], 201)]);
        Mail::fake();
        config(['filesystems.disks.local.root' => sys_get_temp_dir().'/agribantay-phase10-'.Str::uuid(), 'filesystems.disks.local.throw' => true]);
        Storage::forgetDisk('local');
        $this->mock(RecommendationExplanationService::class, function ($mock) {
            $mock->shouldReceive('markForRefresh')->zeroOrMoreTimes();
        });
    }

    protected function tearDown(): void
    {
        if ($this->transaction) {
            DB::rollBack();
        }
        $this->travelBack();
        parent::tearDown();
    }

    public function test_multi_house_registration_monitoring_documents_visits_reports_printing_and_rotation(): void
    {
        $super = User::where('role', 'super_admin')->firstOrFail();
        $staff = User::where('role', 'admin')->firstOrFail();
        $vet = User::where('role', 'vet')->firstOrFail();
        $suffix = Str::random(8);
        $registration = $this->actingAs($super, 'sanctum')->postJson('/api/admin/farm-owners', [
            'first_name' => 'Workflow', 'last_name' => $suffix, 'email' => $suffix.'@example.test',
            'mobile_number' => '09'.random_int(100000000, 999999999), 'address' => 'Synthetic owner address',
            'farms' => [
                ['farm_name' => 'Workflow A '.$suffix, 'farm_size' => 'Small', 'barangay' => 'Calansayan', 'latitude' => 13.855, 'longitude' => 121.093, 'lot_number' => 'A'],
                ['farm_name' => 'Workflow B '.$suffix, 'farm_size' => 'Large', 'barangay' => 'Calansayan', 'latitude' => 13.855, 'longitude' => 121.103, 'lot_number' => 'B'],
            ],
        ])->assertOk();
        $owner = User::findOrFail($registration->json('id'));
        $this->assertCount(2, $owner->farms);
        [$a,$b] = $owner->farms->sortBy('id')->values()->all();
        $devices = [];
        $readings = [];
        $assign = app(DeviceAssignmentService::class);
        for ($i = 0; $i < 3; $i++) {
            $device = Sensor::create(['label' => 'HOUSE-'.$i.'-'.$suffix, 'device_key' => 'synthetic-'.$i.'-'.$suffix, 'status' => 'Active']);
            $assign->change($device->id, $a->id);
            $devices[] = $device->fresh();
            $this->postJson('/api/sensor-readings', ['device_key' => $device->device_key, 'ammonia_raw' => $i === 0 ? 3000 : 100,
                'soil_raw' => 4095, 'temperature' => 28, 'humidity' => 60, 'farm_id' => $b->id])->assertOk();
            $readings[] = SensorReading::where('sensor_id', $device->id)->firstOrFail();
        }
        $this->assertSame(3, Sensor::where('farm_id', $a->id)->where('status', 'Active')->count());
        foreach ($readings as $i => $reading) {
            $this->assertSame($a->id, $reading->farm_id);
            $this->assertSame($devices[$i]->id, $reading->sensor_id);
        }
        $original = array_map(fn ($r) => $r->getAttributes(), $readings);
        $this->assertSame('Critical', app(FarmStatusService::class)->displayStatus($a->fresh()));
        $this->assertGreaterThan(0, AlertHistory::where('farm_id', $a->id)->where('status', 'Critical')->count());
        $dashboard = $this->actingAs($owner, 'sanctum')->getJson('/api/farmer/dashboard?farm_id='.$a->id)->assertOk()->assertJsonPath('data.device_count', 3)->assertJsonCount(3, 'data.devices')->json('data.devices');
        foreach ($readings as $i => $reading) {
            $row = collect($dashboard)->firstWhere('device_id', $devices[$i]->id);
            $this->assertNotNull($row);
            $this->assertSame((float) $reading->ammonia, (float) $row['ammonia']);
        }
        $this->getJson('/api/farmer/readings-history?farm_id='.$a->id)->assertOk()->assertJsonCount(3, 'data.devices');
        $this->getJson('/api/farmer/dashboard?farm_id='.$b->id)->assertOk()->assertJsonPath('data.device_count', 0);
        $this->actingAs($staff, 'sanctum')->getJson('/api/admin/farms/'.$a->id)->assertOk()->assertJsonCount(3, 'data.device_list')->assertJsonPath('data.display_status', 'Critical');
        $this->postJson('/api/admin/inspections', ['farm_id' => $a->id, 'inspection_type' => 'General Inspection', 'scheduled_at' => '2026-11-02 09:00:00'])->assertOk();
        $this->assertSame($staff->id, Inspection::where('farm_id', $a->id)->firstOrFail()->assigned_to);
        $this->getJson('/api/admin/farms/'.$a->id.'/inspection-records?per_page=10')->assertOk()->assertJsonPath('data.total', 1);
        $this->actingAs($owner, 'sanctum');
        $upload = $this->post('/api/farmer/farms/'.$a->id.'/control-documents', [
            'category' => 'odor_control', 'document' => UploadedFile::fake()->createWithContent('synthetic.pdf', "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"),
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->actingAs($staff, 'sanctum')->get('/api/farms/'.$a->id.'/control-documents/'.$upload->json('data.id').'/file')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertSame('Compliant', app(MaintenanceStatusService::class)->getStatus($a)['status']);
        $this->actingAs($owner, 'sanctum')->postJson('/api/farmer/service-requests', ['farm_id' => $a->id, 'service_type' => 'Blood Test Request', 'notes' => 'Synthetic visit'])->assertOk();
        $service = ServiceRequest::where('farm_id', $a->id)->firstOrFail();
        $this->actingAs($vet, 'sanctum')->patchJson('/api/vet/vaccination-requests/'.$service->id.'/accept', ['scheduled_at' => '2026-11-03 10:00:00'])->assertOk();
        $this->assertSame('Scheduled', $service->fresh()->status);
        $this->actingAs($staff, 'sanctum')->getJson('/api/admin/reports?from=2026-11-01&to=2026-11-01')->assertOk()
            ->assertJsonPath('data.alert_summary.total_incidents', AlertHistory::where('farm_id', $a->id)->count());
        $p = $this->postJson('/api/admin/farms/'.$a->id.'/print-preview', ['sections' => ['farm', 'owner', 'monitoring', 'compliance', 'readings', 'inspections', 'documents'], 'date_mode' => 'all'])->assertOk()->json('data');
        $this->assertCount(3, $p['snapshots']['monitoring']);
        foreach ($readings as $i => $reading) {
            $row = collect($p['snapshots']['monitoring'])->firstWhere('device_name', $devices[$i]->device_name);
            $this->assertNotNull($row);
            $this->assertSame((float) $reading->ammonia, (float) $row['ammonia']);
        }
        $this->assertSame(3, $p['streams']['readings']['total']);
        $this->assertSame(1, $p['streams']['documents']['total']);
        foreach ($devices as $device) {
            $this->assertStringNotContainsString($device->device_key, json_encode($p));
        }
        $this->postJson('/api/admin/farms/'.$a->id.'/print-batch', ['ticket' => $p['ticket'], 'section' => 'readings', 'after_id' => 0])->assertOk()->assertJsonCount(3, 'data.items');
        $assign->change($devices[0]->id, null);
        $this->assertSame(2, Sensor::where('farm_id', $a->id)->count());
        $this->assertSame('Safe', app(FarmStatusService::class)->displayStatus($a->fresh()));
        $assign->change($devices[0]->id, $b->id);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($devices[0]->fresh(), $b->id));
        $assign->change($devices[0]->id, $a->id);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($devices[0]->fresh(), $a->id));
        foreach ($readings as $i => $reading) {
            $this->assertSame($original[$i], $reading->fresh()->getAttributes());
        }
        foreach ([1, 2] as $i) {
            $this->assertSame($readings[$i]->id, app(CurrentMonitoringService::class)->latest($devices[$i]->fresh())->id);
        }
        $this->assertSame(3, SensorReading::where('farm_id', $a->id)->count());
        $this->assertSame(0, SensorReading::where('farm_id', $b->id)->count());
    }

    public function test_unauthorized_archive_deletion_is_denied_without_deleting_any_record(): void
    {
        $report = GeneratedReport::firstOrFail();
        $before = $report->getAttributes();
        $staff = User::where('role', 'admin')->firstOrFail();
        $this->actingAs($staff, 'sanctum')->deleteJson('/api/admin/generated-reports/'.$report->id)->assertNotFound();
        $this->actingAs(User::where('role', 'farm_owner')->firstOrFail(), 'sanctum')->deleteJson('/api/admin/generated-reports/'.$report->id)->assertForbidden();
        $this->assertSame($before, $report->fresh()->getAttributes());
    }

    public function test_duplicate_period_does_not_overwrite_or_duplicate_a_frozen_archive(): void
    {
        $staff = User::where('role', 'admin')->firstOrFail();
        $payload = ['report_name' => 'Synthetic frozen archive', 'period_start' => '1997-01-01', 'period_end' => '1997-01-31', 'report_type' => 'Monthly'];
        $id = $this->actingAs($staff, 'sanctum')->postJson('/api/admin/generated-reports', $payload)->assertCreated()->json('data.id');
        $before = GeneratedReport::findOrFail($id)->getAttributes();
        $count = GeneratedReport::count();
        $this->postJson('/api/admin/generated-reports', $payload)->assertStatus(409);
        $this->assertSame($count, GeneratedReport::count());
        $this->getJson('/api/admin/generated-reports/'.$id)->assertOk();
        $this->assertSame($before, GeneratedReport::findOrFail($id)->getAttributes());
    }
}
