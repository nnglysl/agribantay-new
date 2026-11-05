<?php

namespace Tests\Feature;

use App\Http\Controllers\SensorIngestController;
use App\Mail\OtpCodeMail;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use App\Services\PoultryHouseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Process\Process;
use Tests\Support\PoultryHouseDatabase;
use Tests\Support\PoultryHouseManagementTestCase;

class HouseDeviceAssignmentConcurrencyTest extends PoultryHouseManagementTestCase
{
    protected bool $transactional = false;

    private ?Process $worker = null;

    private User $workerActor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->workerActor = $this->user('admin');
    }

    protected function tearDown(): void
    {
        if ($this->worker?->isRunning()) {
            $this->worker->stop();
        }
        parent::tearDown();
    }

    private function start(string $operation, int $sensor, int $farm, int $house, int $version = 0): void
    {
        // A separate actor prevents an actor-row lock from masquerading as
        // the device/house contention these cases intend to exercise.
        $staff = $this->workerActor;
        $this->worker = new Process([PHP_BINARY, base_path('tests/Support/house-device-assignment-worker.php'),
            $this->fixture, (string) $staff->id, $operation, (string) $sensor, (string) $farm, (string) $house, (string) $version], base_path());
        $this->worker->setTimeout(20);
        $this->worker->start();
        $deadline = microtime(true) + 10;
        while (! str_contains($this->worker->getOutput(), 'READY') && $this->worker->isRunning() && microtime(true) < $deadline) {
            usleep(20000);
        }
        $this->assertStringContainsString('READY', $this->worker->getOutput(), $this->worker->getErrorOutput());
        $query = PoultryHouseDatabase::server()->prepare('SELECT COUNT(*) FROM performance_schema.data_lock_waits w
            JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID WHERE t.PROCESSLIST_DB=?');
        $waiting = false;
        $deadline = microtime(true) + 5;
        do {
            $query->execute([$this->fixture]);
            if ((int) $query->fetchColumn() > 0) {
                $waiting = true;
                break;
            }
            usleep(20000);
        } while ($this->worker->isRunning() && microtime(true) < $deadline);
        $this->assertTrue($waiting, 'Competing operation must wait on a native database lock.');
    }

    private function finish(int $status): void
    {
        DB::commit();
        $this->worker->wait();
        $this->assertTrue($this->worker->isSuccessful(), $this->worker->getErrorOutput());
        $this->assertStringContainsString('RESULT:'.$status, $this->worker->getOutput());
    }

    private function fixtureHouses(): array
    {
        $farm = $this->createRegisteredFarm(2);

        return [$farm, DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('house_number')->pluck('id')->all()];
    }

    private function assign(int $sensor, int $farm, int $house): void
    {
        app(DeviceAssignmentService::class)->assignHouse($this->admin, $sensor, $farm, $house, app(DeviceAssignmentService::class)->version($sensor));
    }

    private function ingest(): void
    {
        app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST',
            ['device_key' => $this->device->device_key, 'ammonia_raw' => 3000, 'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60]));
    }

    public function test_competing_active_devices_cannot_occupy_one_house(): void
    {
        [$farm, $houses] = $this->fixtureHouses();
        $other = $this->makeDevice();
        DB::beginTransaction();
        $this->assign($this->device->id, $farm->id, $houses[0]);
        $this->start('assign', $other->id, $farm->id, $houses[0]);
        $this->finish(422);
        $this->assertNull($other->fresh()->farm_id);
        $this->assertSame(0, DB::table('device_assignment_events')->where('sensor_id', $other->id)->count());
    }

    public function test_ingestion_before_move_keeps_old_provenance_and_sets_new_floor(): void
    {
        [$farm, $houses] = $this->fixtureHouses();
        $this->assign($this->device->id, $farm->id, $houses[0]);
        $version = app(DeviceAssignmentService::class)->version($this->device->id);
        DB::beginTransaction();
        $this->ingest();
        $reading = SensorReading::latest('id')->firstOrFail();
        $this->start('assign', $this->device->id, $farm->id, $houses[1], $version);
        $this->finish(200);
        $this->assertSame($houses[0], (int) $reading->fresh()->poultry_house_id);
        $this->assertSame($version, (int) $reading->assignment_event_id);
        $this->assertSame($reading->id, (int) DB::table('device_assignment_events')->latest('id')->value('reading_floor_id'));
    }

    public function test_simultaneous_replay_of_one_assignment_creates_one_boundary(): void
    {
        [$farm, $houses] = $this->fixtureHouses();
        $version = app(DeviceAssignmentService::class)->version($this->device->id);
        $before = DB::table('device_assignment_events')->where('sensor_id', $this->device->id)->count();
        DB::beginTransaction();
        $this->assign($this->device->id, $farm->id, $houses[0]);
        $this->start('assign', $this->device->id, $farm->id, $houses[0], $version);
        $this->finish(200);
        $this->assertSame($before + 1, DB::table('device_assignment_events')->where('sensor_id', $this->device->id)->count());
        $this->assertSame($houses[0], (int) $this->device->fresh()->poultry_house_id);
    }

    public function test_move_before_ingestion_stamps_only_new_assignment(): void
    {
        [$farm, $houses] = $this->fixtureHouses();
        $this->assign($this->device->id, $farm->id, $houses[0]);
        DB::beginTransaction();
        $this->assign($this->device->id, $farm->id, $houses[1]);
        $version = app(DeviceAssignmentService::class)->version($this->device->id);
        $this->start('ingest', $this->device->id, $farm->id, $houses[1]);
        $this->finish(200);
        $reading = SensorReading::latest('id')->firstOrFail();
        $this->assertSame($houses[1], (int) $reading->poultry_house_id);
        $this->assertSame($version, (int) $reading->assignment_event_id);
    }

    public function test_activation_racing_with_assignment_cannot_take_occupied_slot(): void
    {
        [$farm, $houses] = $this->fixtureHouses();
        $other = $this->makeDevice('Inactive');
        $this->assign($other->id, $farm->id, $houses[0]);
        DB::beginTransaction();
        $this->assign($this->device->id, $farm->id, $houses[0]);
        $this->start('activate', $other->id, $farm->id, $houses[0]);
        $this->finish(422);
        $this->assertSame('Inactive', $other->fresh()->status);
        $this->assertSame($houses[0], (int) $other->fresh()->poultry_house_id);
    }

    public function test_assignment_racing_with_house_deactivation_preserves_association(): void
    {
        [$farm, $houses] = $this->fixtureHouses();
        DB::beginTransaction();
        $this->assign($this->device->id, $farm->id, $houses[0]);
        $this->start('deactivate_house', $this->device->id, $farm->id, $houses[0]);
        $this->finish(422);
        $this->assertSame('Active', DB::table('poultry_houses')->where('id', $houses[0])->value('status'));
    }

    public function test_house_deactivation_racing_with_assignment_rejects_assignment(): void
    {
        [$farm, $houses] = $this->fixtureHouses();
        $version = app(DeviceAssignmentService::class)->version($this->device->id);
        DB::beginTransaction();
        app(PoultryHouseService::class)->transition($this->admin, $farm->id, $houses[0], 'Inactive');
        $this->start('assign', $this->device->id, $farm->id, $houses[0], $version);
        $this->finish(422);
        $this->assertSame($this->a->id, $this->device->fresh()->farm_id);
        $this->assertNull($this->device->fresh()->poultry_house_id);
    }

    public function test_parent_deletion_racing_with_assignment_keeps_retained_evidence_and_rejects_missing_destination(): void
    {
        [$farm, $houses] = $this->fixtureHouses();
        foreach ($houses as $house) {
            app(PoultryHouseService::class)->transition($this->admin, $farm->id, $house, 'Inactive');
        }
        $farm->update(['status' => 'Deactivated']);
        $confirm = ['permanently_discontinued' => true, 'acknowledge_permanent_loss' => true];
        $this->postJson('/api/superadmin/farms/'.$farm->id.'/delete/otp/request', $confirm)->assertOk();
        $code = Mail::sent(OtpCodeMail::class)->last()->code;
        $version = app(DeviceAssignmentService::class)->version($this->device->id);
        DB::beginTransaction();
        $this->deleteJson('/api/superadmin/farms/'.$farm->id, $confirm + ['code' => $code])->assertOk();
        $this->start('assign', $this->device->id, $farm->id, $houses[0], $version);
        $this->finish(404);
        $this->assertNull($farm->fresh());
        $this->assertSame(1, DB::table('poultry_house_initializations')->where('farm_id', $farm->id)->count());
        $this->assertSame($this->a->id, $this->device->fresh()->farm_id);
        $this->assertSame($version, app(DeviceAssignmentService::class)->version($this->device->id));
    }
}
