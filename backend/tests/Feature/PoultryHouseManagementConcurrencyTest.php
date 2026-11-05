<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Services\PoultryHouseService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\Process;
use Tests\Support\PoultryHouseDatabase;
use Tests\Support\PoultryHouseManagementTestCase;

class PoultryHouseManagementConcurrencyTest extends PoultryHouseManagementTestCase
{
    protected bool $transactional = false;

    private ?Process $worker = null;

    protected function tearDown(): void
    {
        if ($this->worker?->isRunning()) {
            $this->worker->stop();
        }
        parent::tearDown();
    }

    public static function requestModes(): array
    {
        return [['different'], ['same']];
    }

    #[DataProvider('requestModes')]
    public function test_concurrent_adds_serialize_number_allocation_and_replays(string $mode): void
    {
        $farm = $this->createRegisteredFarm();
        $staff = $this->user('admin');
        $firstId = (string) Str::uuid();
        $secondId = $mode === 'same' ? $firstId : (string) Str::uuid();
        DB::beginTransaction();
        $first = app(PoultryHouseService::class)->add($this->admin, $farm->id, $firstId);
        $this->worker = new Process([PHP_BINARY, base_path('tests/Support/poultry-house-management-worker.php'),
            $this->fixture, (string) $staff->id, (string) $farm->id, $secondId], base_path());
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
        $this->assertTrue($waiting, 'The competing Add House request must wait on a native database lock.');
        DB::commit();
        $this->worker->wait();
        $this->assertTrue($this->worker->isSuccessful(), $this->worker->getErrorOutput());
        preg_match('/RESULT:(.+)/', $this->worker->getOutput(), $match);
        $this->assertNotEmpty($match);
        $second = json_decode($match[1], true, 512, JSON_THROW_ON_ERROR);
        $expected = $mode === 'same' ? 2 : 3;
        $this->assertSame($expected, (int) $farm->fresh()->last_house_number);
        $this->assertSame(range(1, $expected), DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('house_number')->pluck('house_number')->map(fn ($v) => (int) $v)->all());
        $this->assertSame($mode === 'same', $second['replayed']);
        $this->assertSame($expected - 1, ActivityLog::where('action', 'Added Poultry House')->count());
        if ($mode === 'same') {
            $this->assertSame($first['house']['id'], $second['house']['id']);
        } else {
            $this->assertNotSame($first['house']['id'], $second['house']['id']);
        }
    }
}
