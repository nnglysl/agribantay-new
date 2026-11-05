<?php

namespace Tests\Feature;

use App\Http\Controllers\SensorIngestController;
use App\Models\SensorReading;
use App\Services\DeviceAssignmentService;
use App\Services\PoultryHouseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\Support\Phase9FoundationDatabase as Fixture;
use Tests\Support\PoultryHouseManagementTestCase;

class Phase9ApplicationConcurrencyTest extends PoultryHouseManagementTestCase
{
    protected bool $transactional = false;

    private ?Process $worker = null;

    private function assign(int $sensor, int $farm, int $house): void
    {
        app(DeviceAssignmentService::class)->assignHouse($this->admin, $sensor, $farm, $house, app(DeviceAssignmentService::class)->version($sensor));
    }

    private function setupHouses(): array
    {
        $farm = $this->createRegisteredFarm(2);

        return [$farm->id, DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('id')->pluck('id')->all()];
    }

    private function start(string $operation, int $sensor, int $farm, int $house, int $actor): void
    {
        $input = Fixture::workerInput($this->fixture) + ['operation' => $operation, 'sensor' => $sensor, 'farm' => $farm,
            'house' => $house, 'actor' => $actor, 'version' => app(DeviceAssignmentService::class)->version($sensor)];
        $this->worker = new Process([PHP_BINARY, base_path('tests/Support/phase9-application-worker.php')]);
        $this->worker->setInput(json_encode($input, JSON_THROW_ON_ERROR));
        $this->worker->setTimeout(30);
        $this->worker->start();
        $deadline = microtime(true) + 10;
        do {
            if (preg_match('/READY:(\d+)/', $this->worker->getOutput(), $match)) {
                break;
            }
            usleep(20000);
        } while ($this->worker->isRunning() && microtime(true) < $deadline);
        $this->assertNotEmpty($match[1] ?? '', $this->worker->getErrorOutput());
        $observer = Fixture::privileged($this->fixture);
        $query = getenv('PHASE9_APPLICATION_ENGINE') === 'mariadb'
            ? 'SELECT COUNT(*) FROM information_schema.INNODB_LOCK_WAITS w JOIN information_schema.INNODB_TRX t ON t.trx_id=w.requesting_trx_id JOIN information_schema.PROCESSLIST p ON p.ID=t.trx_mysql_thread_id WHERE p.DB='
            : 'SELECT COUNT(*) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID WHERE t.PROCESSLIST_DB=';
        $waiting = false;
        $diagnostic = [];
        $pending = 0;
        $synchronization = 'unobserved';
        $deadline = microtime(true) + 15;
        do {
            // Laravel can use more than one native PDO per worker (read/write).
            // Match the owned schema's actual waiting writer rather than a sampled read connection.
            if ((int) $observer->query($query.$observer->quote($this->fixture))->fetchColumn() > 0) {
                $waiting = true;
                $synchronization = 'innodb_row_lock';
                break;
            }
            $diagnostic = $observer->query('SELECT trx_mysql_thread_id,trx_state FROM information_schema.INNODB_TRX')->fetchAll();
            if (getenv('PHASE9_APPLICATION_ENGINE') === 'mariadb') {
                $process = $observer->query('SELECT STATE,INFO FROM information_schema.PROCESSLIST WHERE ID='.(int) $match[1].' AND DB='.$observer->quote($this->fixture))->fetch();
                if ($process && in_array($process['STATE'], ['Statistics', 'Sending data'], true) && str_contains(strtolower($process['INFO'] ?? ''), 'for update')) {
                    $pending++;
                    if ($pending >= 2) {
                        $waiting = true;
                        $synchronization = 'pending_native_for_update_'.strtolower(str_replace(' ', '_', $process['STATE']));
                        break;
                    }
                    usleep(200000);
                } else {
                    $pending = 0;
                }
            }
            usleep(50000);
        } while ($this->worker->isRunning() && microtime(true) < $deadline);
        if (! $waiting) {
            $diagnostic[] = $observer->query('SELECT ID,STATE,LEFT(INFO,180) AS query_prefix FROM information_schema.PROCESSLIST WHERE DB='.$observer->quote($this->fixture))->fetchAll();
        }
        $this->assertTrue($waiting, $this->worker->getOutput().' '.json_encode(['engine' => getenv('PHASE9_APPLICATION_ENGINE'), 'transactions' => $diagnostic]).' '.$this->worker->getErrorOutput());
        $path = getenv('PHASE9_CONCURRENCY_EVIDENCE');
        if ($path && realpath(dirname($path)) === realpath(sys_get_temp_dir())
            && preg_match('/\Aagribantay-phase9-evidence-[a-f0-9]+\.jsonl\z/D', basename($path))) {
            file_put_contents($path, json_encode(['scenario' => $this->name(), 'engine' => getenv('PHASE9_APPLICATION_ENGINE'), 'synchronization' => $synchronization]).PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    }

    private function finish(int $status): void
    {
        DB::commit();
        $this->worker->wait();
        $this->assertTrue($this->worker->isSuccessful(), $this->worker->getErrorOutput());
        $this->assertStringContainsString('RESULT:'.$status, $this->worker->getOutput());
    }

    protected function tearDown(): void
    {
        if ($this->worker?->isRunning()) {
            $this->worker->stop();
        }
        parent::tearDown();
    }

    public function test_actual_ingestion_before_assignment_preserves_old_house_and_watermark(): void
    {
        [$farm, $houses] = $this->setupHouses();
        $actor = $this->user('admin');
        $this->assign($this->device->id, $farm, $houses[0]);
        DB::beginTransaction();
        app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST',
            ['device_key' => $this->device->device_key, 'ammonia_raw' => 100, 'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60]));
        $reading = SensorReading::latest('id')->firstOrFail();
        $this->start('assign', $this->device->id, $farm, $houses[1], $actor->id);
        $this->finish(200);
        $this->assertSame($houses[0], $reading->fresh()->poultry_house_id);
        $this->assertSame($reading->id, (int) DB::table('device_assignment_events')->latest('id')->value('reading_floor_id'));
    }

    public function test_actual_assignment_before_ingestion_stamps_new_period(): void
    {
        [$farm, $houses] = $this->setupHouses();
        $actor = $this->user('admin');
        $this->assign($this->device->id, $farm, $houses[0]);
        DB::beginTransaction();
        $this->assign($this->device->id, $farm, $houses[1]);
        $period = $this->device->fresh()->current_assignment_event_id;
        $this->start('ingest', $this->device->id, $farm, $houses[1], $actor->id);
        $this->finish(200);
        $last = SensorReading::latest('id')->firstOrFail();
        $this->assertSame($houses[1], $last->poultry_house_id);
        $this->assertSame($period, $last->assignment_event_id);
    }

    public function test_actual_competing_assignment_and_activation_cannot_displace_active_device(): void
    {
        [$farm, $houses] = $this->setupHouses();
        $actor = $this->user('admin');
        $other = $this->makeDevice('Inactive');
        $this->assign($other->id, $farm, $houses[0]);
        DB::beginTransaction();
        $this->assign($this->device->id, $farm, $houses[0]);
        $this->start('activate', $other->id, $farm, $houses[0], $actor->id);
        $this->finish(422);
        $this->assertSame('Inactive', $other->fresh()->status);
    }

    public function test_actual_house_deactivation_before_assignment_rejects_placement(): void
    {
        [$farm, $houses] = $this->setupHouses();
        $actor = $this->user('admin');
        DB::beginTransaction();
        app(PoultryHouseService::class)->transition($this->admin, $farm, $houses[0], 'Inactive');
        $this->start('assign', $this->device->id, $farm, $houses[0], $actor->id);
        $this->finish(422);
        $this->assertNull($this->device->fresh()->poultry_house_id);
    }

    public function test_actual_assignment_before_house_deactivation_preserves_association(): void
    {
        [$farm, $houses] = $this->setupHouses();
        $actor = $this->user('admin');
        DB::beginTransaction();
        $this->assign($this->device->id, $farm, $houses[0]);
        $this->start('deactivate_house', $this->device->id, $farm, $houses[0], $actor->id);
        $this->finish(422);
        $this->assertSame('Active', DB::table('poultry_houses')->where('id', $houses[0])->value('status'));
    }
}
