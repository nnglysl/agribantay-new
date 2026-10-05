<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\MaintenanceLog;
use App\Models\MaintenanceNotification;
use App\Models\SmsLog;
use App\Models\User;
use App\Services\MaintenanceStatusService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * maintenance:seed-overdue — the Overdue Maintenance demo data.
 *
 * What is actually under test is not "did it write rows" but the four things
 * that make the written rows defensible:
 *
 *   1. The number of farms in a derived phase reaches the target.
 *   2. Nothing contradicts the registration date it moved — the owner account
 *      and the registration entry in the Activity Log move with it.
 *   3. The daily compliance job does NOT fire at the seeded farms. That job
 *      sends a real SMS per farm through a paid gateway, so this is the
 *      assertion that matters most.
 *   4. Running it twice changes nothing the second time.
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=SeedOverdueMaintenanceTest
 *
 * Runs inside a rolled-back transaction; none of these farms survive the run.
 */
class SeedOverdueMaintenanceTest extends TestCase
{
    use DatabaseTransactions;

    /** @var array<int, Farm> */
    private array $farms = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=SeedOverdueMaintenanceTest');
        }

        Http::fake();

        // Any farm already in the database would count towards the command's
        // target and make the arithmetic here depend on the seed, so everything
        // pre-existing is parked out of 'Active' for the duration of the
        // transaction. The rollback puts it back.
        Farm::where('status', 'Active')->update(['status' => 'Inactive']);

        // Twelve compliant farms across all three sizes, so every clean-out
        // interval is exercised rather than one rule twelve times.
        $sizes = ['Small', 'Medium', 'Large'];

        for ($i = 0; $i < 12; $i++) {
            $this->farms[] = $this->makeFarm("Seed Overdue Farm {$i}", $sizes[$i % 3]);
        }
    }

    private function makeFarm(string $name, string $size): Farm
    {
        $owner = User::create([
            'first_name' => 'Seed',
            'last_name' => Str::random(6),
            'email' => Str::lower(Str::random(10)).'@agribantay.test',
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password' => bcrypt('password'),
            'role' => 'farm_owner',
            'status' => 'active',
        ]);

        $farm = Farm::create([
            'user_id' => $owner->id,
            'farm_name' => $name,
            'owner_name' => $owner->first_name.' '.$owner->last_name,
            'mobile_number' => $owner->mobile_number,
            'barangay' => 'Calansayan',
            'municipality' => 'San Jose',
            'province' => 'Batangas',
            'address' => 'Calansayan, San Jose, Batangas',
            'farm_size' => $size,
            'status' => 'Active',
        ]);

        // The entry FarmController@store writes when a farm is registered.
        // Format matters: the command matches on farm name AND owner name.
        ActivityLog::create([
            'user_id' => null,
            'role' => 'admin',
            'action' => 'Created Farm Owner Account',
            'details' => $farm->farm_name.' — '.$farm->owner_name.' — temp password sent via SMS',
            'type' => 'Farm',
        ]);

        return $farm;
    }

    private function phaseCount(): int
    {
        $status = app(MaintenanceStatusService::class);

        return Farm::where('status', 'Active')->with('latestCleanout')->get()
            ->filter(fn (Farm $f) => in_array($status->getStatus($f)['status'], ['Overdue', 'Non-Compliant'], true))
            ->count();
    }

    public function test_dry_run_writes_nothing(): void
    {
        $before = $this->farms[0]->created_at;

        $this->artisan('maintenance:seed-overdue', ['--target' => 8])
            ->assertSuccessful();

        $this->assertEquals(
            $before->toDateTimeString(),
            $this->farms[0]->fresh()->created_at->toDateTimeString(),
            'A dry run must not move a registration date.'
        );
        $this->assertSame(0, $this->phaseCount());
        $this->assertSame(0, MaintenanceNotification::count());
    }

    public function test_it_reaches_the_target_and_shows_both_phases(): void
    {
        $this->artisan('maintenance:seed-overdue', ['--target' => 8, '--force' => true])
            ->assertSuccessful();

        $this->assertSame(8, $this->phaseCount(), 'Should have backdated exactly enough farms to hit the target.');

        $status = app(MaintenanceStatusService::class);
        $statuses = Farm::where('status', 'Active')->with('latestCleanout')->get()
            ->map(fn (Farm $f) => $status->getStatus($f)['status'])
            ->countBy();

        $this->assertGreaterThan(0, $statuses['Overdue'] ?? 0, 'Both phases must be visible, not just one.');
        $this->assertGreaterThan(0, $statuses['Non-Compliant'] ?? 0);

        // An Overdue farm must sit inside the grace window with room to spare,
        // or it turns Non-Compliant on its own before the demo.
        foreach ($this->farms as $farm) {
            $state = $status->getStatus($farm->fresh());

            if ($state['status'] === 'Overdue') {
                $this->assertLessThanOrEqual(
                    20,
                    $state['days_overdue'],
                    'An Overdue farm must keep at least 10 days of grace left.'
                );
            }
        }
    }

    public function test_the_registration_date_is_not_contradicted(): void
    {
        $this->artisan('maintenance:seed-overdue', ['--target' => 8, '--force' => true])
            ->assertSuccessful();

        $status = app(MaintenanceStatusService::class);
        $checked = 0;

        foreach ($this->farms as $farm) {
            $farm = $farm->fresh();

            if (! in_array($status->getStatus($farm)['status'], ['Overdue', 'Non-Compliant'], true)) {
                continue;
            }

            $checked++;

            // A farm cannot be registered by an account that did not yet exist.
            $this->assertTrue(
                $farm->user->created_at->lessThan($farm->created_at),
                "Owner of farm {$farm->id} is newer than the farm itself."
            );

            // Nor can the log entry announcing the registration post-date it.
            $log = ActivityLog::where('type', 'Farm')
                ->where('details', 'like', $farm->farm_name.' — '.$farm->owner_name.'%')
                ->firstOrFail();

            $this->assertLessThanOrEqual(
                $farm->created_at->toDateString(),
                $log->created_at->toDateString(),
                "Registration log for farm {$farm->id} post-dates the registration."
            );
        }

        $this->assertSame(8, $checked);
    }

    /**
     * The one that matters. CheckMaintenanceCompliance runs dailyAt('08:00')
     * and sends a REAL SMS per overdue farm through a paid gateway, to numbers
     * that are seeded rather than real owners'. The seeded notification rows
     * are what stop it.
     */
    public function test_the_daily_compliance_job_sends_nothing_afterwards(): void
    {
        $this->artisan('maintenance:seed-overdue', ['--target' => 8, '--force' => true])
            ->assertSuccessful();

        $noticesAfterSeed = MaintenanceNotification::count();
        $smsBefore = SmsLog::count();

        $this->assertGreaterThanOrEqual(8, $noticesAfterSeed, 'Every seeded farm needs its notification row.');

        $this->artisan('compliance:check-maintenance')->assertSuccessful();

        $this->assertSame(
            $noticesAfterSeed,
            MaintenanceNotification::count(),
            'The compliance job re-notified a seeded farm.'
        );
        $this->assertSame($smsBefore, SmsLog::count(), 'The compliance job sent an SMS for a seeded farm.');
        Http::assertNothingSent();
    }

    public function test_running_it_twice_changes_nothing_the_second_time(): void
    {
        $this->artisan('maintenance:seed-overdue', ['--target' => 8, '--force' => true])->assertSuccessful();

        $dates = Farm::where('status', 'Active')->pluck('created_at', 'id')->map->toDateTimeString()->all();
        $notices = MaintenanceNotification::count();

        $this->artisan('maintenance:seed-overdue', ['--target' => 8, '--force' => true])->assertSuccessful();

        $this->assertSame(
            $dates,
            Farm::where('status', 'Active')->pluck('created_at', 'id')->map->toDateTimeString()->all(),
            'A second run moved a registration date.'
        );
        $this->assertSame($notices, MaintenanceNotification::count(), 'A second run duplicated notification rows.');
        $this->assertSame(8, $this->phaseCount());
    }

    public function test_a_farm_with_a_logged_cleanout_is_never_picked(): void
    {
        $cleaned = $this->farms[0];

        MaintenanceLog::create([
            'farm_id' => $cleaned->id,
            'maintenance_type' => 'Full Manure Clean-out',
            'performed_at' => now()->subDays(5),
            'photo_path' => 'maintenance-photos/test.jpg',
        ]);

        $before = $cleaned->created_at->toDateTimeString();

        $this->artisan('maintenance:seed-overdue', ['--target' => 8, '--force' => true])->assertSuccessful();

        // Its status anchors on the clean-out, so moving its registration would
        // not move its status — picking it would be a wasted, lying edit.
        $this->assertSame($before, $cleaned->fresh()->created_at->toDateTimeString());
    }

    public function test_protected_farms_are_left_compliant(): void
    {
        // The live demo farms the real device rotates between. Their ids are
        // fixed in the command; if they are not in this database there is
        // nothing to protect and the test has nothing to say.
        $protected = Farm::whereIn('id', [3463, 3763])->get();

        if ($protected->isEmpty()) {
            $this->markTestSkipped('Protected demo farms 3463/3763 are not in this database.');
        }

        $before = $protected->pluck('created_at', 'id')->map->toDateTimeString()->all();

        $this->artisan('maintenance:seed-overdue', ['--target' => 8, '--force' => true])->assertSuccessful();

        $this->assertSame(
            $before,
            Farm::whereIn('id', [3463, 3763])->pluck('created_at', 'id')->map->toDateTimeString()->all()
        );
    }
}
