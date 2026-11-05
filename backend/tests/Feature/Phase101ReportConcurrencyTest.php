<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class Phase101ReportConcurrencyTest extends TestCase
{
    public function test_parallel_same_generator_period_is_created_once_and_other_roles_remain_independent(): void
    {
        if (getenv('PHASE101_RACE_DATABASE') === false) {
            $this->markTestSkipped('New private schema fixture required.');
        }
        $database = getenv('PHASE101_RACE_DATABASE');
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', $database);
        $this->assertContains(config('database.connections.mysql.host'), ['127.0.0.1', 'localhost', '::1']);
        config(['database.connections.report_race' => array_replace(config('database.connections.mysql'), ['database' => $database, 'url' => null])]);
        $target = DB::connection('report_race');
        $this->assertSame(0, $target->table('generated_reports')->where('period_start', '1995-01-01')->count(), 'Use a fresh fixture; no cleanup is performed.');
        foreach ([2, 3] as $userId) {
            $barrier = sys_get_temp_dir().'/agribantay-report-race-'.bin2hex(random_bytes(8));
            $workers = [];
            try {
                for ($i = 0; $i < 2; $i++) {
                    $p = new Process([PHP_BINARY, base_path('tests/Support/report-generation-worker.php'), $database, (string) $userId, $barrier], base_path(), null, null, 30);
                    $p->start();
                    $workers[] = $p;
                }
                $deadline = microtime(true) + 20;
                while (! collect($workers)->every(fn ($p) => str_contains($p->getOutput(), 'READY'))) {
                    if (microtime(true) >= $deadline) {
                        break;
                    }
                    usleep(10000);
                }
                $this->assertTrue(collect($workers)->every(fn ($p) => str_contains($p->getOutput(), 'READY')), 'Workers must reach barrier.');
                file_put_contents($barrier, 'synthetic');
                $statuses = [];
                foreach ($workers as $p) {
                    $p->wait();
                    $this->assertTrue($p->isSuccessful(), 'Private worker failed.');
                    preg_match('/STATUS=(\d+)/', $p->getOutput(), $m);
                    $statuses[] = (int) ($m[1] ?? 0);
                }
                sort($statuses);
                $this->assertSame([201, 409], $statuses);
                $this->assertSame(1, $target->table('generated_reports')->where('generated_by_id', $userId)->where('period_start', '1995-01-01')->count());
            } finally {
                foreach ($workers as $p) {
                    if ($p->isRunning()) {
                        $p->stop();
                    }
                }
            }
        }
        $this->assertSame(2, $target->table('generated_reports')->where('period_start', '1995-01-01')->count());
    }
}
