<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\FarmSmsAlertState;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\SmsLog;
use App\Models\User;
use App\Services\AlertHistoryService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PDO;
use Symfony\Component\Process\Process;
use Tests\Support\SmsAlertDatabase;
use Tests\TestCase;

/** Real independent PHP processes against a disposable, isolated MySQL DB. */
class SmsAlertConcurrencyTest extends TestCase
{
    private ?PDO $server = null;

    private ?string $testDatabase = null;

    private array $workers = [];

    private ?string $barrier = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('SMS_TEST_MYSQL') !== '1') {
            $this->markTestSkipped('Set SMS_TEST_MYSQL=1 to run real concurrent workers against a temporary MySQL database.');
        }
        $mysql = config('database.connections.mysql');
        try {
            $this->server = new PDO('mysql:host='.$mysql['host'].';port='.$mysql['port'], $mysql['username'], $mysql['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $name = 'agribantay_sms_test_'.bin2hex(random_bytes(6));
            $this->server->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            // Record only a database successfully created by this test.
            $this->testDatabase = $name;
        } catch (\PDOException $exception) {
            $this->markTestSkipped('Local MySQL cannot create an isolated test database (SQLSTATE '.$exception->getCode().').');
        }
        config(['database.connections.sms_concurrency' => array_replace($mysql, ['database' => $this->testDatabase, 'url' => null])]);
        DB::setDefaultConnection('sms_concurrency');
        DB::purge('sms_concurrency');
        SmsAlertDatabase::create();
        Schema::create('sms_test_deliveries', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('farm_id');
        });
        $this->travelTo(now()->setDate(2026, 10, 9)->setTime(0, 0));
    }

    protected function tearDown(): void
    {
        foreach ($this->workers as $worker) {
            if ($worker->isRunning()) {
                $worker->stop();
            }
        }
        if ($this->barrier && is_file($this->barrier)) {
            unlink($this->barrier);
        }
        DB::purge('sms_concurrency');
        // Never drop the configured app DB, only the exact temporary database
        // that this setup created and whose fixed prefix is verified again.
        if ($this->server && $this->testDatabase && preg_match('/\Aagribantay_sms_test_[a-f0-9]{12}\z/', $this->testDatabase)) {
            $this->server->exec('DROP DATABASE `'.$this->testDatabase.'`');
        }
        $this->travelBack();
        parent::tearDown();
    }

    private function farm(): Farm
    {
        $owner = User::create(['first_name' => 'Test', 'last_name' => 'Farmer', 'mobile_number' => '09123456789']);
        $farm = Farm::create(['user_id' => $owner->id, 'farm_name' => 'Concurrent test', 'mobile_number' => $owner->mobile_number]);
        Sensor::create(['farm_id' => $farm->id, 'device_key' => (string) Str::uuid(), 'status' => 'Active']);
        $this->criticalReading($farm);

        return $farm;
    }

    private function criticalReading(Farm $farm): void
    {
        $sensor = $farm->sensors()->firstOrFail();
        SensorReading::create(['farm_id' => $farm->id, 'sensor_id' => $sensor->id, 'ammonia_status' => 'Critical']);
        app(AlertHistoryService::class)->recordReading($farm->id, 'ammonia', 'Critical', 40, null, $sensor->id);
    }

    private function race(array $farms): void
    {
        $this->barrier = sys_get_temp_dir().DIRECTORY_SEPARATOR.'agribantay-sms-'.bin2hex(random_bytes(6));
        $this->workers = [];
        foreach ($farms as $farm) {
            $worker = new Process([PHP_BINARY, base_path('tests/Support/sms-alert-worker.php'), $this->testDatabase, (string) $farm->id, $this->barrier, now()->toDateTimeString()], base_path());
            $worker->setTimeout(25);
            $worker->start();
            $this->workers[] = $worker;
        }
        $deadline = microtime(true) + 15;
        do {
            $ready = collect($this->workers)->every(fn ($worker) => str_contains($worker->getOutput(), 'READY'));
            if (! $ready) {
                usleep(10000);
            }
        } while (! $ready && microtime(true) < $deadline);
        $this->assertTrue($ready, 'Concurrent test workers did not reach their start barrier.');
        touch($this->barrier);
        foreach ($this->workers as $worker) {
            $worker->wait();
            $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput());
        }
        unlink($this->barrier);
        $this->barrier = null;
    }

    public function test_concurrent_first_time_workers_send_one_initial_sms(): void
    {
        $farm = $this->farm();
        $this->race([$farm, $farm, $farm, $farm]);
        $this->assertSame(1, DB::table('sms_test_deliveries')->count());
        $this->assertSame(1, SmsLog::where('status', 'Sent')->count());
        $this->assertSame(1, FarmSmsAlertState::count());
    }

    public function test_concurrent_reminder_workers_send_one_reminder_at_the_noon_visit(): void
    {
        $farm = $this->farm();
        $this->race([$farm]);
        // Initial at 08:00 Manila; reminder at 12:00, represented in UTC.
        $this->travel(4)->hours();
        $this->criticalReading($farm);
        $this->race([$farm, $farm, $farm, $farm]);
        $this->assertSame(2, DB::table('sms_test_deliveries')->count());
        $this->assertSame(2, SmsLog::where('status', 'Sent')->count());
    }

    public function test_concurrent_different_farms_are_independent(): void
    {
        $a = $this->farm();
        $b = $this->farm();
        $this->race([$a, $b, $a, $b]);
        $this->assertSame(1, DB::table('sms_test_deliveries')->where('farm_id', $a->id)->count());
        $this->assertSame(1, DB::table('sms_test_deliveries')->where('farm_id', $b->id)->count());
    }
}
