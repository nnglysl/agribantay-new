<?php

namespace Tests\Feature;

use App\Http\Controllers\SensorIngestController;
use App\Http\Controllers\SuperAdmin\FarmDeletionController;
use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\CurrentMonitoringService;
use App\Services\DeviceAssignmentService;
use App\Services\RecommendationExplanationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use PDO;
use Symfony\Component\Process\Process;
use Tests\Support\PhaseOneDatabase;
use Tests\Support\PoultryHouseDatabase;
use Tests\TestCase;

class AssignmentIngestionConcurrencyTest extends TestCase
{
    private ?Process $worker = null;

    private array $ownedFixtures = [];

    protected function tearDown(): void
    {
        if ($this->worker?->isRunning()) {
            $this->worker->stop();
        }
        if (DB::connection()->transactionLevel()) {
            DB::rollBack();
        }
        DB::purge('phase1_mysql');
        foreach ($this->ownedFixtures as $name => $server) {
            if (! preg_match('/\Aagribantay_phase1_test_[a-f0-9]{12}\z/D', $name)) {
                throw new \RuntimeException('Refusing non-fixture cleanup.');
            }
            $server->exec('DROP DATABASE `'.$name.'`');
        }
        $this->travelBack();
        parent::tearDown();
    }

    public function test_real_mysql_row_lock_serializes_both_ingestion_assignment_orders(): void
    {
        [$server, $database, $a, $b, $device] = $this->fixtures();
        $assignments = app(DeviceAssignmentService::class);

        DB::beginTransaction();
        Sensor::whereKey($device->id)->lockForUpdate()->firstOrFail();
        $this->startWorker($database, 'ingest', $device, $a);
        $this->assertWaitingOnDevice($server, $database);
        $assignments->change($device->id, $b->id);
        DB::commit();
        $this->finishWorker();
        $this->assertSame($b->id, SensorReading::latest('id')->firstOrFail()->farm_id);

        $assignments->change($device->id, $a->id);
        DB::beginTransaction();
        Sensor::whereKey($device->id)->lockForUpdate()->firstOrFail();
        $response = app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST', [
            'device_key' => $device->device_key, 'ammonia_raw' => 100, 'soil_raw' => 3000,
            'temperature' => 28, 'humidity' => 60, 'farm_id' => $b->id,
        ]));
        $this->assertSame(200, $response->getStatusCode());
        $accepted = SensorReading::latest('id')->firstOrFail();
        $this->startWorker($database, 'assign', $device, $b);
        $this->assertWaitingOnDevice($server, $database);
        DB::commit();
        $this->finishWorker();
        $this->assertSame($a->id, $accepted->fresh()->farm_id);
        $this->assertSame($b->id, $device->fresh()->farm_id);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($device->fresh()));
        $this->assertSame(2, SensorReading::count());
    }

    public function test_real_mysql_deletion_and_ingestion_serialize_in_both_orders(): void
    {
        [$server, $database, $a, $b, $device] = $this->fixtures();
        $a->update(['status' => 'Deactivated']);
        Auth::setUser(User::where('role', 'super_admin')->firstOrFail());
        app(DeviceAssignmentService::class)->change($device->id, null);
        DB::beginTransaction();
        $this->deleteFixture($a);
        $this->startWorker($database, 'ingest', $device, $a, 409);
        $this->assertWaitingOnDevice($server, $database);
        DB::commit();
        $this->finishWorker();
        $this->assertNull($a->fresh());
        $this->assertNull($device->fresh()->farm_id);
        $this->assertSame(0, SensorReading::count());

        app(DeviceAssignmentService::class)->change($device->id, $b->id);
        $b->update(['status' => 'Deactivated']);
        DB::beginTransaction();
        $response = app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST', [
            'device_key' => $device->device_key, 'ammonia_raw' => 100, 'soil_raw' => 3000,
            'temperature' => 28, 'humidity' => 60,
        ]));
        $this->assertSame(200, $response->getStatusCode());
        $reading = SensorReading::latest('id')->firstOrFail();
        $this->startWorker($database, 'delete', $device, $b, 422);
        $this->assertWaitingOnDevice($server, $database);
        DB::commit();
        $this->finishWorker();
        // A racing delete cannot silently end the assignment. The accepted
        // reading remains until a separate explicit unassignment and delete.
        $this->assertNotNull($b->fresh());
        $this->assertSame($b->id, $device->fresh()->farm_id);
        $this->assertNotNull($reading->fresh());
        app(DeviceAssignmentService::class)->change($device->id, null);
        $this->deleteFixture($b);
        $closing = DB::table('device_assignment_events')->where('sensor_id', $device->id)->latest('id')->first();
        $this->assertSame($reading->id, (int) $closing->reading_floor_id);
        $this->assertSame($b->id, (int) $closing->from_farm_id);
        $this->assertNull($closing->to_farm_id);
        $this->assertNull($device->fresh()->farm_id);
        $this->assertNull($b->fresh());
        $this->assertSame(2, DB::table('activity_logs')->where('action', 'Unassigned Sensor')->count());
    }

    public function test_real_mysql_insight_capture_blocks_reassignment_until_its_inputs_are_captured(): void
    {
        [$server, $database, $a, $b, $device] = $this->fixtures();
        $reading = SensorReading::create(['farm_id' => $a->id, 'sensor_id' => $device->id, 'ammonia' => 2]);
        $device->update(['last_seen_at' => now()]);
        $monitoring = app(CurrentMonitoringService::class);
        $snapshot = $monitoring->capture($a, function ($farm) use ($server, $database, $b, $device, $monitoring) {
            $reading = $monitoring->latest($device->fresh(), $farm->id);
            $this->startWorker($database, 'assign', $device, $b);
            $this->assertWaitingOnDevice($server, $database);

            return ['reading' => $reading];
        });
        $this->finishWorker();
        $this->assertSame($reading->id, $snapshot['data']['reading']->id);
        $this->assertFalse($monitoring->snapshotIsCurrent($a->id, $snapshot));
        $this->assertSame($b->id, $device->fresh()->farm_id);
    }

    private function deleteFixture(Farm $farm): void
    {
        Cache::put('farm-delete-otp:'.Auth::id().':'.$farm->id, ['hash' => Hash::make('123456'), 'closure_confirmed' => true], 60);
        $response = app(FarmDeletionController::class)->destroy(Request::create('/fixture-delete', 'DELETE', [
            'code' => '123456', 'permanently_discontinued' => true, 'acknowledge_permanent_loss' => true]), $farm->id);
        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_real_mysql_assignment_into_a_deleting_farm_cannot_leave_an_orphan(): void
    {
        [$server, $database, $a, $b, $device] = $this->fixtures();
        $other = Sensor::create(['label' => 'Second race device', 'device_key' => 'second-race-fixture', 'status' => 'Active']);
        app(DeviceAssignmentService::class)->change($other->id, $b->id);
        $a->update(['status' => 'Deactivated']);
        Auth::setUser(User::where('role', 'super_admin')->firstOrFail());
        app(DeviceAssignmentService::class)->change($device->id, null);
        DB::beginTransaction();
        $this->deleteFixture($a);
        $this->startWorker($database, 'assign', $other, $a, 404);
        $this->assertWaitingOnDevice($server, $database);
        DB::commit();
        $this->finishWorker();
        $this->assertSame($b->id, $other->fresh()->farm_id);
        $this->assertSame(1, DB::table('device_assignment_events')->where('sensor_id', $other->id)->count());
    }

    public function test_real_mysql_ingestion_works_without_the_optional_voltage_migration(): void
    {
        [, , $a, , $device] = $this->fixtures(false);
        $old = SensorReading::create(['farm_id' => $a->id, 'sensor_id' => $device->id,
            'ammonia' => 1.56, 'ammonia_raw' => 429]);
        $before = (array) DB::table('sensor_readings')->where('id', $old->id)->first();
        $this->assertFalse(Schema::hasColumn('sensor_readings', 'ammonia_adc_mv'));
        $response = app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST', [
            'device_key' => $device->device_key, 'ammonia_raw' => 100, 'soil_raw' => 3000,
            'temperature' => 28, 'humidity' => 60,
        ]));
        $this->assertSame(200, $response->getStatusCode());
        $this->assertFalse(Schema::hasColumn('sensor_readings', 'ammonia_adc_mv'));
        $this->assertSame($before, (array) DB::table('sensor_readings')->where('id', $old->id)->first());
        $this->assertSame(2, SensorReading::count());
    }

    private function fixtures(bool $withVoltage = true): array
    {
        if (getenv('PHASE1_TEST_MYSQL') !== '1') {
            $this->markTestSkipped('Enable PHASE1_TEST_MYSQL=1 for isolated local MySQL workers.');
        }
        $mysql = config('database.connections.mysql');
        $this->assertContains($mysql['host'], ['localhost', '127.0.0.1', '::1']);
        $server = PoultryHouseDatabase::server(); // Positively identify the verified local server before DDL.
        $database = 'agribantay_phase1_test_'.bin2hex(random_bytes(6));
        // Only CREATE in a new namespace; no DROP/TRUNCATE/reset is executed.
        $server->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $this->ownedFixtures[$database] = $server;
        config(['database.connections.phase1_mysql' => array_replace($mysql, ['database' => $database, 'url' => null]),
            'cache.default' => 'array']);
        DB::setDefaultConnection('phase1_mysql');
        DB::purge('phase1_mysql');
        PhaseOneDatabase::create($withVoltage);
        PhaseOneDatabase::correctionTables();
        Http::preventStrayRequests();
        Http::fake();
        Mail::fake();
        $this->mock(RecommendationExplanationService::class)->shouldReceive('markForRefresh')->zeroOrMoreTimes();
        $this->travelTo(now()->startOfSecond());
        $admin = User::create(['first_name' => 'Admin', 'last_name' => 'Fixture', 'mobile_number' => '09000000001', 'role' => 'admin']);
        User::create(['first_name' => 'Super', 'last_name' => 'Fixture', 'mobile_number' => '09000000002', 'role' => 'super_admin']);
        $this->actingAs($admin);
        $a = Farm::create(['user_id' => $admin->id, 'farm_name' => 'A', 'farm_size' => 'Small', 'mobile_number' => $admin->mobile_number]);
        $b = Farm::create(['user_id' => $admin->id, 'farm_name' => 'B', 'farm_size' => 'Small', 'mobile_number' => $admin->mobile_number]);
        $device = Sensor::create(['label' => 'Race', 'device_key' => 'phase-one-race-fixture', 'status' => 'Active']);
        $assignments = app(DeviceAssignmentService::class);
        $assignments->change($device->id, $a->id);
        // tearDown removes only the guarded schemas created by this test instance.

        return [$server, $database, $a, $b, $device];
    }

    private function startWorker(string $database, string $action, Sensor $device, Farm $farm, int $expected = 200): void
    {
        $this->worker = new Process([PHP_BINARY, base_path('tests/Support/phase-one-worker.php'), $database,
            $action, (string) $device->id, (string) $farm->id, now()->toDateTimeString(), (string) $expected], base_path());
        $this->worker->setTimeout(20);
        $this->worker->start();
        $deadline = microtime(true) + 10;
        while (! str_contains($this->worker->getOutput(), 'READY') && $this->worker->isRunning() && microtime(true) < $deadline) {
            usleep(20000);
        }
        $this->assertStringContainsString('READY', $this->worker->getOutput(), $this->worker->getErrorOutput());
    }

    private function assertWaitingOnDevice(PDO $server, string $database): void
    {
        $query = $server->prepare("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE DB = ? AND INFO LIKE '%for update%'");
        $deadline = microtime(true) + 5;
        do {
            $query->execute([$database]);
            if ((int) $query->fetchColumn() > 0) {
                return;
            }
            usleep(20000);
        } while ($this->worker->isRunning() && microtime(true) < $deadline);
        $this->fail('Worker did not block on the device row lock.');
    }

    private function finishWorker(): void
    {
        $this->worker->wait();
        $this->assertTrue($this->worker->isSuccessful(), $this->worker->getErrorOutput());
        $this->assertStringContainsString('DONE', $this->worker->getOutput());
    }
}
