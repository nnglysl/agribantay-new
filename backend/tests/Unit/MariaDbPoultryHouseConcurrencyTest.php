<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\Facade;
use PDO;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Process\Process;
use Tests\Support\MariaDbHouseOperations as Operations;
use Tests\Support\MariaDbPoultryHouseFixture as Fixture;
use Throwable;

final class MariaDbPoultryHouseConcurrencyTest extends TestCase
{
    private Fixture $harness;

    private array $target;

    private PDO $pdo;

    private ?Process $worker = null;

    private string $isolation = 'REPEATABLE READ';

    protected function setUp(): void
    {
        if (getenv('POULTRY_HOUSE_MARIADB_PROTOTYPE') !== '1') {
            $this->markTestSkipped('Explicit isolated MariaDB opt-in required.');
        }
        $this->harness = new Fixture;
        $this->target = $this->harness->create();
        try {
            $this->pdo = Fixture::connect($this->target['database']);
            Fixture::migrate(Fixture::capsule($this->pdo, $this->target['database'], $this->target['token']));
            $this->pdo->exec("INSERT INTO poultry_houses(farm_id,house_number,status) VALUES(1,1,'Active'),(1,2,'Active'),(2,1,'Active')");
        } catch (Throwable $error) {
            $this->harness->drop($this->target['database']);
            throw $error;
        }
    }

    protected function tearDown(): void
    {
        if ($this->worker?->isRunning()) {
            $this->worker->stop();
        }
        if (isset($this->pdo) && $this->pdo->inTransaction()) {
            $this->pdo->rollBack();
        }
        if (isset($this->target)) {
            $this->harness->drop($this->target['database']);
        }
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication(null);
        parent::tearDown();
    }

    private function start(string $operation, int $sensor = 1, int $farm = 1, int $house = 1, ?int $event = null): void
    {
        $this->worker = new Process([PHP_BINARY, dirname(__DIR__).'/Support/mariadb-house-worker.php']);
        $this->worker->setInput(json_encode([...$this->target, 'operation' => $operation, 'sensor' => $sensor,
            'farm' => $farm, 'house' => $house, 'event' => $event, 'isolation' => $this->isolation], JSON_THROW_ON_ERROR));
        $this->worker->setTimeout(20);
        $this->worker->start();
        $deadline = microtime(true) + 8;
        do {
            if (preg_match('/READY:(\d+)/', $this->worker->getOutput(), $match)) {
                break;
            }
            usleep(20000);
        } while ($this->worker->isRunning() && microtime(true) < $deadline);
        $this->assertNotEmpty($match[1] ?? '', $this->worker->getErrorOutput());
        $q = $this->pdo->prepare('SELECT COUNT(*) FROM information_schema.INNODB_LOCK_WAITS w
            JOIN information_schema.INNODB_TRX t ON t.trx_id=w.requesting_trx_id WHERE t.trx_mysql_thread_id=?');
        $waiting = false;
        $deadline = microtime(true) + 5;
        do {
            $q->execute([(int) $match[1]]);
            if ((int) $q->fetchColumn() > 0) {
                $waiting = true;
                break;
            }
            usleep(50000);
        } while ($this->worker->isRunning() && microtime(true) < $deadline);
        $this->assertTrue($waiting, 'Competing connection must be observed waiting on a native InnoDB lock. '.$this->worker->getOutput().' '.$this->worker->getErrorOutput());
    }

    private function finish(string $status, ?int $code = null): array
    {
        $this->pdo->commit();
        $this->worker->wait();
        $this->assertTrue($this->worker->isSuccessful(), $this->worker->getErrorOutput());
        $lines = explode("\n", trim($this->worker->getOutput()));
        $result = json_decode(end($lines), true, 32, JSON_THROW_ON_ERROR);
        $this->assertSame($status, $result['status']);
        if ($code !== null) {
            $this->assertSame($code, $result['code']);
        }

        return $result;
    }

    private function committedAssignment(int $sensor = 1, int $farm = 1, int $house = 1): int
    {
        $this->pdo->beginTransaction();
        $event = Operations::assign($this->pdo, $sensor, $farm, $house);
        $this->pdo->commit();

        return $event;
    }

    public function test_competing_active_assignments_wait_then_reject_duplicate_slot(): void
    {
        $this->pdo->beginTransaction();
        Operations::assign($this->pdo, 1, 1, 1);
        $this->start('assign', 2);
        $this->finish('rejected', 1062);
        $this->assertNull($this->pdo->query('SELECT farm_id FROM sensors WHERE id=2')->fetchColumn());
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM device_assignment_events WHERE sensor_id=2')->fetchColumn(), 'Failed worker must retain only its original historical event.');
    }

    public function test_concurrent_activation_cannot_take_an_occupied_slot(): void
    {
        $this->pdo->exec("UPDATE sensors SET status='Inactive' WHERE id=1");
        $this->committedAssignment();
        $this->committedAssignment(3);
        $this->pdo->beginTransaction();
        $this->pdo->exec("UPDATE sensors SET status='Active' WHERE id=1");
        $this->start('activate', 3);
        $this->finish('rejected', 1062);
        $this->assertSame('Inactive', $this->pdo->query('SELECT status FROM sensors WHERE id=3')->fetchColumn());
    }

    public function test_house_deactivation_waits_for_assignment_then_rejects(): void
    {
        $this->pdo->beginTransaction();
        Operations::assign($this->pdo, 1, 1, 1);
        $this->start('deactivate_house');
        $this->finish('rejected', 1644);
        $this->assertSame('Active', $this->pdo->query('SELECT status FROM poultry_houses WHERE id=1')->fetchColumn());
    }

    public static function isolationModes(): array
    {
        return ['repeatable read' => ['REPEATABLE READ'], 'read committed' => ['READ COMMITTED']];
    }

    #[DataProvider('isolationModes')]
    public function test_assignment_waits_for_house_deactivation_then_rejects(string $mode): void
    {
        $this->isolation = $mode;
        $this->pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL '.$mode);
        $this->pdo->beginTransaction();
        $this->pdo->exec("UPDATE poultry_houses SET status='Inactive' WHERE id=1");
        $this->start('assign');
        $this->finish('rejected', 1644);
        $this->assertNull($this->pdo->query('SELECT poultry_house_id FROM sensors WHERE id=1')->fetchColumn());
    }

    #[DataProvider('isolationModes')]
    public function test_autocommit_trigger_read_cannot_admit_a_deactivated_house(string $mode): void
    {
        $this->isolation = $mode;
        $event = Operations::event($this->pdo, 1, 1, 1); // Synthetic period prepared before standalone UPDATE.
        $this->pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL '.$mode);
        $this->pdo->beginTransaction();
        $this->pdo->exec("UPDATE poultry_houses SET status='Inactive' WHERE id=1");
        $this->start('autocommit_assign', 1, 1, 1, $event);
        $this->finish('rejected', 1644);
        $this->assertNull($this->pdo->query('SELECT poultry_house_id FROM sensors WHERE id=1')->fetchColumn());
    }

    public function test_ingestion_before_move_retains_old_period_and_sets_new_watermark(): void
    {
        $old = $this->committedAssignment();
        $this->pdo->beginTransaction();
        $reading = Operations::ingest($this->pdo, 1);
        $this->start('assign', 1, 1, 2);
        $this->finish('ok');
        $this->assertSame(['poultry_house_id' => 1, 'assignment_event_id' => $old], $this->pdo->query('SELECT poultry_house_id,assignment_event_id FROM sensor_readings WHERE id='.$reading)->fetch());
        $this->assertSame($reading, (int) $this->pdo->query('SELECT reading_floor_id FROM device_assignment_events ORDER BY id DESC LIMIT 1')->fetchColumn());
    }

    public function test_move_before_ingestion_stamps_the_new_period(): void
    {
        $this->committedAssignment();
        $this->pdo->beginTransaction();
        $new = Operations::assign($this->pdo, 1, 1, 2);
        $this->start('ingest');
        $this->finish('ok');
        $this->assertSame(['poultry_house_id' => 2, 'assignment_event_id' => $new], $this->pdo->query('SELECT poultry_house_id,assignment_event_id FROM sensor_readings ORDER BY id DESC LIMIT 1')->fetch());
    }

    public function test_assignment_into_a_deleted_parent_is_rejected_without_partial_event(): void
    {
        $this->pdo->beginTransaction();
        $this->pdo->exec('DELETE FROM poultry_houses WHERE farm_id=2');
        $this->pdo->exec('DELETE FROM farms WHERE id=2');
        $this->start('assign', 2, 2, 3);
        $result = $this->finish('rejected', 1452);
        $this->assertLessThanOrEqual(3, $result['attempts']);
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM device_assignment_events WHERE sensor_id=2')->fetchColumn());
        $this->assertNull($this->pdo->query('SELECT farm_id FROM sensors WHERE id=2')->fetchColumn());
    }
}
