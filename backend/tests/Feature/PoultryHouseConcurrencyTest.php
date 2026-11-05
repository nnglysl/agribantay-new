<?php

namespace Tests\Feature;

use App\Http\Controllers\SuperAdmin\FarmDeletionController;
use App\Models\Farm;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\Support\PoultryHouseDatabase;
use Tests\TestCase;

class PoultryHouseConcurrencyTest extends TestCase
{
    private ?string $fixture = null;

    private ?Process $worker = null;

    protected function tearDown(): void
    {
        if ($this->worker?->isRunning()) {
            $this->worker->stop();
        }
        if ($this->fixture) {
            while (DB::transactionLevel()) {
                DB::rollBack();
            }
            DB::purge('house_phase2');
            PoultryHouseDatabase::drop($this->fixture);
        }
        parent::tearDown();
    }

    private function startWorker(string $action, int $device, int $farm, int $house, int $event): void
    {
        $this->worker = new Process([PHP_BINARY, base_path('tests/Support/poultry-house-worker.php'),
            $this->fixture, $action, (string) $device, (string) $farm, (string) $house, (string) $event], base_path());
        $this->worker->setTimeout(20);
        $this->worker->start();
        $deadline = microtime(true) + 10;
        while (! str_contains($this->worker->getOutput(), 'READY') && $this->worker->isRunning() && microtime(true) < $deadline) {
            usleep(20000);
        }
        $this->assertStringContainsString('READY', $this->worker->getOutput(), $this->worker->getErrorOutput());
        $query = PoultryHouseDatabase::server()->prepare('SELECT COUNT(*) FROM performance_schema.data_lock_waits w
            JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID WHERE t.PROCESSLIST_DB=?');
        $deadline = microtime(true) + 5;
        do {
            $query->execute([$this->fixture]);
            if ((int) $query->fetchColumn() > 0) {
                $this->addToAssertionCount(1);

                return;
            }
            usleep(20000);
        } while ($this->worker->isRunning() && microtime(true) < $deadline);
        $this->fail('The native worker must demonstrably wait on a database lock.');
    }

    private function rejected(string $sqlstate): void
    {
        $this->worker->wait();
        $this->assertTrue($this->worker->isSuccessful(), $this->worker->getErrorOutput());
        $this->assertStringContainsString('REJECTED:'.$sqlstate, $this->worker->getOutput());
    }

    public function test_native_occupancy_deactivation_and_parent_delete_races(): void
    {
        if (getenv('POULTRY_HOUSE_MYSQL_TEST') !== '1') {
            $this->markTestSkipped('Explicit disposable native MySQL fixture required.');
        }
        $this->fixture = PoultryHouseDatabase::create();
        PoultryHouseDatabase::migrate();
        config(['cache.default' => 'array']);
        Mail::fake();
        Http::preventStrayRequests();
        $admin = User::create(['first_name' => 'Synthetic', 'last_name' => 'Admin', 'password' => 'unusable-fixture',
            'must_change_password' => false, 'role' => 'super_admin', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum');
        $farm = Farm::create(['user_id' => $admin->id, 'farm_name' => 'Concurrency fixture', 'owner_name' => 'Synthetic',
            'barangay' => 'Bagong Sikat', 'municipality' => 'San Jose', 'province' => 'Occidental Mindoro',
            'farm_size' => 'Small', 'current_status' => 'Safe', 'status' => 'Deactivated']);
        $houses = [];
        $devices = [];
        $events = [];
        foreach ([1, 2] as $n) {
            $houses[$n] = DB::table('poultry_houses')->insertGetId(['farm_id' => $farm->id, 'house_number' => $n, 'status' => 'Active']);
            $devices[$n] = DB::table('sensors')->insertGetId(['device_key' => 'synthetic-'.$n, 'status' => 'Active']);
            $log = DB::table('activity_logs')->insertGetId(['user_id' => $admin->id, 'role' => 'super_admin',
                'action' => 'Synthetic assignment', 'type' => 'Farm']);
            $events[$n] = DB::table('device_assignment_events')->insertGetId(['sensor_id' => $devices[$n],
                'activity_log_id' => $log,
                'to_farm_id' => $farm->id, 'to_house_id' => $houses[1], 'reading_floor_id' => 0, 'alert_floor_id' => 0, 'occurred_at' => now()]);
        }
        DB::beginTransaction();
        DB::table('sensors')->where('id', $devices[1])->update(['farm_id' => $farm->id, 'poultry_house_id' => $houses[1], 'current_assignment_event_id' => $events[1]]);
        $this->startWorker('associate', $devices[2], $farm->id, $houses[1], $events[2]);
        DB::commit();
        $this->rejected('23000');
        $this->assertSame(1, DB::table('sensors')->where('active_house_slot', $houses[1])->count());
        DB::table('device_assignment_events')->where('id', $events[2])->update(['to_house_id' => $houses[2]]);
        DB::beginTransaction();
        DB::table('poultry_houses')->where('id', $houses[2])->update(['status' => 'Inactive']);
        $this->startWorker('associate', $devices[2], $farm->id, $houses[2], $events[2]);
        DB::commit();
        $this->rejected('45000');
        DB::table('poultry_houses')->where('id', $houses[2])->update(['status' => 'Active']);
        DB::beginTransaction();
        DB::table('sensors')->where('id', $devices[2])->update(['farm_id' => $farm->id, 'poultry_house_id' => $houses[2], 'current_assignment_event_id' => $events[2]]);
        $this->startWorker('deactivate', $devices[2], $farm->id, $houses[2], $events[2]);
        DB::commit();
        $this->rejected('45000');
        $this->assertSame('Active', DB::table('poultry_houses')->where('id', $houses[2])->value('status'));
        // Explicit administrative unassignment occurs before the deletion transaction.
        foreach ($devices as $device) {
            app(DeviceAssignmentService::class)->change($device, null);
        }
        DB::table('poultry_houses')->where('farm_id', $farm->id)->update(['status' => 'Inactive']);
        DB::table('farms')->where('id', $farm->id)->update(['house_inventory_verified_at' => now(), 'last_house_number' => 2]);
        DB::table('poultry_house_initializations')->insert(['farm_id' => $farm->id, 'operation_id' => (string) Str::uuid(),
            'source' => 'verified_population', 'initial_house_count' => 2, 'verification_reference' => 'Synthetic verified closure',
            'verifier_role' => 'super_admin', 'completed_at' => now()]);
        Cache::put('farm-delete-otp:'.$admin->id.':'.$farm->id, ['hash' => Hash::make('123456'), 'closure_confirmed' => true], 60);
        DB::beginTransaction();
        $response = app(FarmDeletionController::class)->destroy(Request::create('/synthetic-delete', 'DELETE', [
            'code' => '123456', 'permanently_discontinued' => true, 'acknowledge_permanent_loss' => true]), $farm->id);
        $this->assertSame(200, $response->getStatusCode());
        $this->startWorker('farm_assign', $devices[2], $farm->id, 0, 0);
        DB::commit();
        $this->rejected('23000');
        $this->assertNull(DB::table('sensors')->where('id', $devices[2])->value('farm_id'));
        $this->assertNull($farm->fresh());
        $this->assertNotNull($admin->fresh());
        $this->assertSame(1, DB::table('poultry_house_initializations')->count());
        $this->assertSame(4, DB::table('device_assignment_events')->count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }
}
