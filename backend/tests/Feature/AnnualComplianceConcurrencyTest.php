<?php
namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class AnnualComplianceConcurrencyTest extends TestCase
{
    public function test_two_independent_commands_reserve_and_deliver_only_one_annual_event(): void
    {
        if (getenv('PHASE8_TEST_MYSQL') !== '1') $this->markTestSkipped('Explicit private MySQL fixture required.');
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $database = getenv('PHASE8_RACE_DATABASE') ?: '';
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', $database);
        $this->assertNotSame(DB::connection()->getDatabaseName(), $database, 'Race uses a separate pristine schema fixture.');
        config(['database.connections.annual_race' => array_merge(config('database.connections.mysql'), ['database' => $database, 'url' => null])]);
        $target = DB::connection('annual_race');
        $this->assertSame(0, $target->table('notifications')->count());
        $this->assertSame(0, $target->table('sms_logs')->count());
        $this->assertSame(1, $target->table('farms')->count(), 'Create a new schema-only fixture for each run.');
        $target->table('farms')->update(['status' => 'Inactive']);
        $id = $target->table('farms')->insertGetId(['user_id' => 4, 'farm_name' => 'Synthetic annual race', 'owner_name' => 'Private Fixture Owner',
            'mobile_number' => '09000000004', 'barangay' => 'Calansayan', 'address' => 'Synthetic', 'farm_size' => 'Large', 'status' => 'Active',
            'created_at' => '2025-10-31 02:00:00', 'updated_at' => '2025-10-31 02:00:00']);
        $env = ['DB_CONNECTION' => 'mysql', 'DB_DATABASE' => $database, 'DB_HOST' => config('database.connections.mysql.host'), 'DB_URL' => '', 'APP_ENV' => 'testing'];
        $workers = [];
        for ($i = 0; $i < 2; $i++) {
            $workers[$i] = new Process([PHP_BINARY, base_path('tests/Support/annual-compliance-worker.php')], base_path(), $env, null, 30);
            $workers[$i]->start();
        }
        foreach ($workers as $worker) { $worker->wait(); $this->assertTrue($worker->isSuccessful(), 'Isolated worker must finish successfully.'); }
        $this->assertSame(1, $target->table('maintenance_notifications')->where('farm_id', $id)->count());
        $this->assertSame(1, $target->table('sms_logs')->where('farm_id', $id)->count());
        $this->assertSame(3, $target->table('notifications')->count());
        fwrite(STDOUT, "\nRetained isolated annual notification fixture: {$database}\n");
        DB::purge('annual_race');
    }
}
