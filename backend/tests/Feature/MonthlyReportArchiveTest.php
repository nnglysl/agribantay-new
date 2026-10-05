<?php

namespace Tests\Feature;

use App\Console\Commands\GenerateMonthlyReport;
use App\Models\Farm;
use App\Models\GeneratedReport;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Monthly report archive: only finalised, complete periods are ever archived,
 * and an existing archive is never overwritten or duplicated.
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=MonthlyReportArchiveTest
 *
 * Every test runs inside a transaction that is rolled back, so nothing written
 * here survives the run and the existing archived reports are left untouched.
 */
class MonthlyReportArchiveTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=MonthlyReportArchiveTest');
        }

        $this->admin = User::where('role', 'admin')->firstOrFail();
    }

    private function makeFarm(): Farm
    {
        $owner = User::create([
            'first_name'    => 'Archive',
            'last_name'     => Str::random(6),
            'email'         => Str::lower(Str::random(10)) . '@agribantay.test',
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password'      => bcrypt('password'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => 'Archive Test Farm',
            'owner_name'    => 'Archive Owner',
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Calansayan',
            'municipality'  => 'San Jose',
            'province'      => 'Batangas',
            'address'       => 'Calansayan, San Jose, Batangas',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** The command archives the month before the one it runs in — never the current one. */
    public function test_command_targets_the_preceding_month(): void
    {
        $cases = [
            '2026-10-01 01:00:00' => ['2026-09-01', '2026-09-30'],
            '2026-11-01 01:00:00' => ['2026-10-01', '2026-10-31'],
            '2027-01-01 01:00:00' => ['2026-12-01', '2026-12-31'],
            '2027-03-01 01:00:00' => ['2027-02-01', '2027-02-28'],
        ];

        foreach ($cases as $now => [$expectedStart, $expectedEnd]) {
            Carbon::setTestNow($now);

            $start = Carbon::now()->subMonthNoOverflow()->startOfMonth();
            $end = $start->copy()->endOfMonth();

            $this->assertSame($expectedStart, $start->toDateString(), "start for run at {$now}");
            $this->assertSame($expectedEnd, $end->toDateString(), "end for run at {$now}");
        }
    }

    /** The targeted period has always finished by the time it is archived. */
    public function test_targeted_period_has_always_already_ended(): void
    {
        foreach (['2026-10-01 01:00:00', '2026-10-31 23:59:00', '2027-02-01 00:00:01', '2027-12-01 01:00:00'] as $now) {
            Carbon::setTestNow($now);

            $end = Carbon::now()->subMonthNoOverflow()->startOfMonth()->endOfMonth();

            $this->assertTrue($end->isPast(), "period end {$end} should be in the past when run at {$now}");
        }
    }

    /** Running twice for the same month does not create a second archive. */
    public function test_command_is_idempotent_for_an_already_archived_month(): void
    {
        // Seed the month this run will target, inside the test transaction.
        Carbon::setTestNow('2027-06-05 01:00:00');
        $targetStart = Carbon::now()->subMonthNoOverflow()->startOfMonth();

        GeneratedReport::create([
            'report_name' => $targetStart->format('F Y').' Report',
            'period_start' => $targetStart->toDateString(),
            'period_end' => $targetStart->copy()->endOfMonth()->toDateString(),
            'report_type' => 'PDF',
            'snapshot' => ['seeded_by' => 'MonthlyReportArchiveTest'],
        ]);

        $before = GeneratedReport::count();

        $this->artisan(GenerateMonthlyReport::class)
            ->expectsOutputToContain('already exists')
            ->assertExitCode(0);

        $this->assertSame($before, GeneratedReport::count(), 'no duplicate archive should be created');
    }

    /** A month with no archive yet does get one, covering the whole month. */
    public function test_command_archives_a_month_that_has_none(): void
    {
        Carbon::setTestNow('2027-06-05 01:00:00');
        $targetStart = Carbon::now()->subMonthNoOverflow()->startOfMonth();

        $this->assertFalse(
            GeneratedReport::whereDate('period_start', $targetStart->toDateString())->exists(),
            'precondition: target month must not already be archived'
        );

        $this->artisan(GenerateMonthlyReport::class)->assertExitCode(0);

        $created = GeneratedReport::whereDate('period_start', $targetStart->toDateString())->first();

        $this->assertNotNull($created);
        $this->assertSame('2027-05-01', $created->period_start->toDateString());
        $this->assertSame('2027-05-31', $created->period_end->toDateString());
        $this->assertNotEmpty($created->snapshot);
    }

    /** Archiving a new month leaves the reports already on file exactly as they were. */
    public function test_existing_archives_are_left_untouched(): void
    {
        $before = GeneratedReport::orderBy('id')->get()
            ->mapWithKeys(fn ($r) => [$r->id => [
                $r->report_name,
                $r->period_start->toDateString(),
                $r->period_end->toDateString(),
                $r->created_at->toDateTimeString(),
            ]]);

        Carbon::setTestNow('2027-06-05 01:00:00');
        $this->artisan(GenerateMonthlyReport::class)->assertExitCode(0);

        foreach ($before as $id => $snapshotOfRow) {
            $after = GeneratedReport::find($id);

            $this->assertNotNull($after, "report {$id} must still exist");
            $this->assertSame($snapshotOfRow, [
                $after->report_name,
                $after->period_start->toDateString(),
                $after->period_end->toDateString(),
                $after->created_at->toDateTimeString(),
            ], "report {$id} must be unchanged");
        }
    }

    /** The manual endpoint refuses a period that is still running. */
    /**
     * Reports are generated on demand now, so a period that is still running
     * is allowed — but the stored period is clamped to today, so the document
     * can never be headed a range wider than the figures it actually covers.
     */
    public function test_manual_generation_clamps_a_period_that_has_not_ended(): void
    {
        $today = Carbon::now(\App\Support\LocalTime::timezone());

        $this->actingAs($this->admin)
            ->postJson('/api/admin/generated-reports', [
                'report_name' => 'Unfinished Period Report',
                'period_start' => $today->copy()->startOfMonth()->toDateString(),
                'period_end' => $today->copy()->addMonth()->endOfMonth()->toDateString(),
                'report_type' => 'Monthly',
            ])
            ->assertStatus(201);

        $created = GeneratedReport::where('report_name', 'Unfinished Period Report')->firstOrFail();

        $this->assertSame(
            $today->toDateString(),
            $created->period_end->toDateString(),
            'the period must be clamped to today, not left in the future'
        );
    }

    public function test_a_period_that_has_not_started_is_refused(): void
    {
        $today = Carbon::now(\App\Support\LocalTime::timezone());

        $this->actingAs($this->admin)
            ->postJson('/api/admin/generated-reports', [
                'report_name' => 'Future Period Report',
                'period_start' => $today->copy()->addMonths(2)->startOfMonth()->toDateString(),
                'period_end' => $today->copy()->addMonths(2)->endOfMonth()->toDateString(),
                'report_type' => 'Monthly',
            ])
            ->assertStatus(422);

        $this->assertFalse(GeneratedReport::where('report_name', 'Future Period Report')->exists());
    }

    /** The manual endpoint refuses to duplicate a period that is already archived. */
    public function test_manual_generation_rejects_a_duplicate_period(): void
    {
        // Must be an archive whose period has already ended, otherwise the
        // unfinished-period guard answers first (422) and the duplicate guard
        // is never reached — which is the correct order of checks.
        $existing = GeneratedReport::orderBy('id')->get()
            ->first(fn ($r) => $r->period_end->endOfDay()->isPast());

        if (! $existing) {
            $this->markTestSkipped('No archived report with a completed period to test duplicate handling against.');
        }

        $before = GeneratedReport::count();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/generated-reports', [
                'report_name' => 'Duplicate Attempt',
                'period_start' => $existing->period_start->toDateString(),
                'period_end' => $existing->period_end->toDateString(),
                'report_type' => 'Monthly',
            ])
            ->assertStatus(409)
            ->assertJsonPath('data.id', $existing->id);

        $this->assertSame($before, GeneratedReport::count(), 'the duplicate must not be created');
        $this->assertSame(
            $existing->created_at->toDateTimeString(),
            GeneratedReport::find($existing->id)->created_at->toDateTimeString(),
            'the existing archive must not be overwritten'
        );
    }

    /** A completed, not-yet-archived period is still accepted. */
    public function test_manual_generation_accepts_a_completed_period(): void
    {
        // A month far enough back that the fixture data has no archive for it.
        $start = Carbon::create(2025, 3, 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        if (GeneratedReport::whereDate('period_start', $start->toDateString())->exists()) {
            $this->markTestSkipped('Fixture already has an archive for the chosen control month.');
        }

        $response = $this->actingAs($this->admin)
            ->postJson('/api/admin/generated-reports', [
                'report_name' => $start->format('F Y').' Report',
                'period_start' => $start->toDateString(),
                'period_end' => $end->toDateString(),
                'report_type' => 'Monthly',
            ])
            ->assertStatus(201);

        $created = GeneratedReport::find($response->json('data.id'));

        $this->assertNotNull($created);
        $this->assertSame('2025-03-01', $created->period_start->toDateString());
        $this->assertSame('2025-03-31', $created->period_end->toDateString());
        $this->assertSame('Monthly', $created->report_type, 'the chosen period kind must be stored');
    }

    /**
     * The point of the whole fix: a month is archived only once it is over, and
     * the resulting record's own creation time is after the period it covers.
     *
     * July 2026 is used rather than September because September already has the
     * incomplete development archive (id 2) on file, which the duplicate guard
     * correctly refuses to replace. The behaviour proved here is exactly what
     * September will get once that record is dealt with.
     */
    public function test_month_is_archived_only_after_it_ends_and_covers_the_whole_period(): void
    {
        if (GeneratedReport::whereDate('period_start', '2026-07-01')->exists()) {
            $this->markTestSkipped('Fixture already has a July 2026 archive.');
        }

        $generationMoment = '2026-08-01 01:00:00';
        Carbon::setTestNow($generationMoment);

        $this->artisan(GenerateMonthlyReport::class)->assertExitCode(0);

        $report = GeneratedReport::whereDate('period_start', '2026-07-01')->firstOrFail();

        // Reporting period: the complete preceding month.
        $this->assertSame('2026-07-01', $report->period_start->toDateString());
        $this->assertSame('2026-07-31', $report->period_end->toDateString());

        // Date Generated: the real creation instant, strictly after the period.
        $this->assertSame($generationMoment, $report->created_at->toDateTimeString());
        $this->assertTrue(
            $report->created_at->greaterThan($report->period_end->copy()->endOfDay()),
            'a finalised archive must be created after its reporting period has ended'
        );
    }

    /** Records dated on the final day of the month are inside the archive. */
    public function test_final_day_records_are_included_in_the_archive(): void
    {
        if (GeneratedReport::whereDate('period_start', '2026-07-01')->exists()) {
            $this->markTestSkipped('Fixture already has a July 2026 archive.');
        }

        // Created, not borrowed — this test needs *a* farm to hang records on,
        // not whichever one the database happens to hold. Reaching for an
        // existing row made it fail outright once the pre-launch cleanup left
        // none, even though the archive logic under test was unchanged.
        $farm = $this->makeFarm();

        // A clean-out on the last calendar day, and an inspection completed late
        // that same evening — the case a midnight-truncated end bound would drop.
        MaintenanceLog::create([
            'farm_id' => $farm->id,
            'maintenance_type' => 'Full Manure Clean-out',
            'performed_at' => '2026-07-31',
            'notes' => 'ArchiveTest final-day clean-out',
            // NOT NULL with no default in the schema.
            'photo_path' => 'maintenance/archivetest-placeholder.png',
        ]);

        Inspection::create([
            'inspection_number' => 'INS-ARCHIVETEST',
            'farm_id' => $farm->id,
            'inspection_type' => 'General Inspection',
            'status' => 'Completed',
            // Stated in Philippine local time, because that is the calendar the
            // report period follows: 23:30 on 31 July in San Jose is 15:30 UTC.
            // A naive string here would be read as UTC, i.e. 07:30 on 1 August
            // locally, and would correctly fall into the NEXT month's report.
            'scheduled_at' => Carbon::parse('2026-07-31 09:00:00', 'Asia/Manila')->utc(),
            'completed_at' => Carbon::parse('2026-07-31 23:30:00', 'Asia/Manila')->utc(),
        ]);

        Carbon::setTestNow('2026-08-01 01:00:00');
        $this->artisan(GenerateMonthlyReport::class)->assertExitCode(0);

        $snapshot = GeneratedReport::whereDate('period_start', '2026-07-01')->firstOrFail()->snapshot;

        $this->assertContains(
            'INS-ARCHIVETEST',
            array_column($snapshot['completed_inspections'], 'inspection_number'),
            'an inspection completed at 23:30 on the final day must be in the archive'
        );
        $this->assertContains(
            'Jul 31, 2026',
            array_column($snapshot['maintenance_completed'], 'performed_at'),
            'a clean-out logged on the final day must be in the archive'
        );

        // The period summary agrees with the rows it summarises.
        $this->assertSame(
            count($snapshot['completed_inspections']),
            $snapshot['period_activity']['inspections_completed']
        );
    }

    /**
     * Current state of the real database: September cannot be finalised while
     * the incomplete development archive (id 2) is still on file. The command
     * skips rather than overwriting it, so removing that record stays an
     * explicit human decision.
     */
    public function test_september_is_blocked_by_the_existing_incomplete_archive(): void
    {
        $existing = GeneratedReport::whereDate('period_start', '2026-09-01')->first();

        if (! $existing) {
            $this->markTestSkipped('No September 2026 archive on file.');
        }

        $before = [$existing->id, $existing->created_at->toDateTimeString(), GeneratedReport::count()];

        Carbon::setTestNow('2026-10-01 01:00:00');
        $this->artisan(GenerateMonthlyReport::class)
            ->expectsOutputToContain('already exists')
            ->assertExitCode(0);

        $after = GeneratedReport::find($existing->id);

        $this->assertSame(
            $before,
            [$after->id, $after->created_at->toDateTimeString(), GeneratedReport::count()],
            'the incomplete September archive must be left exactly as it was'
        );
    }

    /** Leap and non-leap February, and the year boundary, resolve correctly. */
    public function test_month_and_year_boundaries(): void
    {
        $cases = [
            '2027-01-01 01:00:00' => ['2026-12-01', '2026-12-31'],
            '2028-03-01 01:00:00' => ['2028-02-01', '2028-02-29'],
            '2027-03-01 01:00:00' => ['2027-02-01', '2027-02-28'],
            '2027-05-01 01:00:00' => ['2027-04-01', '2027-04-30'],
        ];

        foreach ($cases as $now => [$expectedStart, $expectedEnd]) {
            Carbon::setTestNow($now);
            $start = Carbon::now()->subMonthNoOverflow()->startOfMonth();

            $this->assertSame($expectedStart, $start->toDateString(), "start for {$now}");
            $this->assertSame($expectedEnd, $start->copy()->endOfMonth()->toDateString(), "end for {$now}");
        }
    }

    /** period_end is inclusive of the whole final day, not truncated to midnight. */
    public function test_period_end_covers_the_whole_final_day(): void
    {
        $end = Carbon::parse('2026-09-30')->endOfDay();

        $this->assertSame('2026-09-30 23:59:59', $end->toDateTimeString());
        $this->assertTrue(
            Carbon::parse('2026-09-30 22:15:00')->between(Carbon::parse('2026-09-01')->startOfDay(), $end),
            'a record late on the final day must fall inside the period'
        );
    }
}
