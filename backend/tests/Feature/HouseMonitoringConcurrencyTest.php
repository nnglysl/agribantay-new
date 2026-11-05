<?php

namespace Tests\Feature;

use App\Http\Controllers\SensorIngestController;
use App\Services\DeviceAssignmentService;
use App\Services\HouseMonitoringService;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\Support\PoultryHouseManagementTestCase;

class HouseMonitoringConcurrencyTest extends PoultryHouseManagementTestCase
{
    protected bool $transactional = false;

    public function test_read_snapshot_does_not_mix_houses_when_an_assignment_commits_mid_read(): void
    {
        $farm = $this->createRegisteredFarm(2);
        $houses = DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('house_number')->pluck('id');
        $service = app(DeviceAssignmentService::class);
        $service->assignHouse($this->admin, $this->device->id, $farm->id, $houses[0], $service->version($this->device->id));
        app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST',
            ['device_key' => $this->device->device_key, 'ammonia_raw' => 3000, 'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60]));
        $version = $service->version($this->device->id);
        $staff = $this->user('admin');
        $worker = new Process([PHP_BINARY, base_path('tests/Support/house-device-assignment-worker.php'),
            $this->fixture, (string) $staff->id, 'assign', (string) $this->device->id, (string) $farm->id, (string) $houses[1], (string) $version], base_path());
        $worker->setTimeout(20);
        $connection = DB::connection();
        $original = $connection->getEventDispatcher();
        $dispatcher = clone $original;
        $moved = false;
        $dispatcher->listen(QueryExecuted::class, function ($event) use (&$moved, $worker) {
            if (! $moved && str_contains($event->sql, 'select * from `sensors` where `farm_id`')) {
                $moved = true;
                $worker->run();
                $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput());
                $this->assertStringContainsString('RESULT:200', $worker->getOutput());
            }
        });
        $connection->setEventDispatcher($dispatcher);
        try {
            $snapshot = app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id);
        } finally {
            $connection->setEventDispatcher($original);
            if ($worker->isRunning()) {
                $worker->stop();
            }
        }
        $this->assertTrue($moved, 'The independent assignment committed during the snapshot read.');
        $this->assertSame(['Critical', 'Not Monitored'], array_column($snapshot['rows'], 'state'));
        $this->assertSame($houses[0], (int) $snapshot['rows'][0]['current_reading']['poultry_house_id']);
        $next = app(HouseMonitoringService::class)->snapshot($this->admin, $farm->id);
        $this->assertSame(['Not Monitored', 'No Readings Yet'], array_column($next['rows'], 'state'));
    }
}
