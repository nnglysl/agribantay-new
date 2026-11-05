<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\User;
use App\Services\FarmRegistrationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Process\Process;
use Tests\Support\PoultryHouseDatabase;
use Tests\TestCase;

class FarmRegistrationConcurrencyTest extends TestCase
{
    private ?Process $worker = null;

    private ?string $fixture = null;

    protected function tearDown(): void
    {
        if ($this->worker?->isRunning()) {
            $this->worker->stop();
        }
        if (DB::connection()->transactionLevel()) {
            DB::rollBack();
        }
        DB::purge('house_phase2');
        if ($this->fixture) {
            PoultryHouseDatabase::drop($this->fixture);
        }
        parent::tearDown();
    }

    public function test_simultaneous_new_owner_submissions_do_not_create_duplicate_records(): void
    {
        $this->checkDuplicate('new');
    }

    public function test_simultaneous_existing_owner_submissions_do_not_duplicate_farms(): void
    {
        $this->checkDuplicate('existing');
    }

    private function checkDuplicate(string $mode): void
    {
        if (getenv('PHASE3_TEST_MYSQL') !== '1') {
            $this->markTestSkipped('Enable PHASE3_TEST_MYSQL=1 for private local MySQL workers.');
        }
        $server = PoultryHouseDatabase::server();
        $database = $this->fixture = PoultryHouseDatabase::create();
        PoultryHouseDatabase::migrate(true);
        config(['cache.default' => 'array']);
        Http::preventStrayRequests();
        Http::fake();
        Mail::fake();
        $first = User::create(['first_name' => 'Super', 'last_name' => 'Fixture', 'password' => 'unusable-fixture', 'must_change_password' => false, 'mobile_number' => '09000000001', 'role' => 'super_admin', 'status' => 'active']);
        $second = User::create(['first_name' => 'Staff', 'last_name' => 'Fixture', 'password' => 'unusable-fixture', 'must_change_password' => false, 'mobile_number' => '09000000002', 'role' => 'admin', 'status' => 'active']);
        $payload = ['farms' => [['farm_name' => 'Concurrent farm', 'farm_size' => 'Small', 'house_count' => 2, 'barangay' => 'Calansayan',
            'latitude' => 13.855, 'longitude' => 121.093]]];
        $owner = null;
        if ($mode === 'new') {
            $payload += ['first_name' => 'Concurrent', 'last_name' => 'Owner', 'mobile_number' => '09930000001',
                'email' => 'concurrent-owner@example.test', 'address' => 'Fixture owner address'];
        } else {
            $owner = User::create(['first_name' => 'Existing', 'last_name' => 'Owner', 'password' => 'unusable-fixture', 'must_change_password' => false, 'mobile_number' => '09000000003', 'role' => 'farm_owner', 'status' => 'active']);
            $payload['farm_owner_id'] = $owner->id;
        }
        $request = Request::create('/fixture-registration', 'POST', $payload);
        $request->setUserResolver(fn () => $first);
        DB::beginTransaction();
        app(FarmRegistrationService::class)->register($request, $mode === 'new');
        Mail::assertNothingSent();
        $this->worker = new Process([PHP_BINARY, base_path('tests/Support/registration-worker.php'), $database,
            $mode, (string) $second->id, (string) ($owner?->id ?? 0)], base_path());
        $this->worker->setTimeout(20);
        $this->worker->start();
        $deadline = microtime(true) + 10;
        while (! str_contains($this->worker->getOutput(), 'READY') && $this->worker->isRunning() && microtime(true) < $deadline) {
            usleep(20000);
        }
        $this->assertStringContainsString('READY', $this->worker->getOutput(), $this->worker->getErrorOutput());
        $q = $server->prepare("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE DB = ? AND INFO LIKE '%for update%'");
        $waiting = false;
        $deadline = microtime(true) + 5;
        do {
            $q->execute([$database]);
            if ((int) $q->fetchColumn() > 0) {
                $waiting = true;
                break;
            }
            usleep(20000);
        } while ($this->worker->isRunning() && microtime(true) < $deadline);
        $this->assertTrue($waiting, 'Duplicate registration did not wait on the shared registration lock.');
        DB::commit();
        $this->worker->wait();
        $this->assertTrue($this->worker->isSuccessful(), $this->worker->getErrorOutput());
        $this->assertStringContainsString('DONE', $this->worker->getOutput());
        $this->assertSame(1, Farm::count());
        $this->assertSame(1, User::where('role', 'farm_owner')->count());
        Mail::assertSentCount($mode === 'new' ? 1 : 0);
        $this->assertSame(2, DB::table('poultry_houses')->count());
        $this->assertSame(1, DB::table('poultry_house_initializations')->count());
    }
}
