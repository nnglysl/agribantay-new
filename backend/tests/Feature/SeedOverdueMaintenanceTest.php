<?php
namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** The retired demo must never rewrite registration, notice or evidence dates. */
class SeedOverdueMaintenanceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        Http::preventStrayRequests(); Http::fake();
    }

    private function evidence(): array
    {
        $result = [];
        foreach (['farms', 'users', 'activity_logs', 'maintenance_notifications', 'maintenance_logs', 'sms_logs'] as $table)
            $result[$table] = hash('sha256', DB::table($table)->orderBy('id')->get()->toJson());
        return $result;
    }

    public function test_dry_run_backdating_command_is_retired_without_changes(): void
    {
        $before = $this->evidence();
        $this->artisan('maintenance:seed-overdue')->assertFailed();
        $this->assertSame($before, $this->evidence()); Http::assertNothingSent();
    }

    public function test_force_option_cannot_backdate_or_fabricate_notices(): void
    {
        $before = $this->evidence();
        $this->artisan('maintenance:seed-overdue', ['--force' => true, '--target' => 100])->assertFailed();
        $this->assertSame($before, $this->evidence()); Http::assertNothingSent();
    }

    public function test_retired_size_grace_seeder_is_a_safe_noop(): void
    {
        $before = $this->evidence();
        (new \Database\Seeders\OverdueMaintenanceTestSeeder)->run();
        $this->assertSame($before, $this->evidence()); Http::assertNothingSent();
    }
}