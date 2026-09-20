<?php

namespace Tests\Feature;

use App\Console\Commands\GenerateMonthlyReport;
use App\Models\Farm;
use App\Models\GeneratedReport;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Services\GeneratedReportService;
use App\Support\LocalTime;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A monthly report covers a PHILIPPINE calendar month.
 *
 * Timestamps are stored in UTC, so "September in San Jose" is
 * 2026-08-31 16:00:00Z .. 2026-09-30 15:59:59Z — not 00:00Z..23:59Z. These
 * tests pin the eight hours at each end of the month that the UTC-bounded
 * version got wrong.
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ReportPeriodTimezoneTest
 *
 * Runs inside a rolled-back transaction. No stored timestamp is altered and no
 * archived report is created, deleted or changed.
 */
class ReportPeriodTimezoneTest extends TestCase
{
    use DatabaseTransactions;

    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ReportPeriodTimezoneTest');
        }

        $this->farm = Farm::where('status', 'Active')->firstOrFail();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** Creates a completed inspection at an exact Manila wall-clock moment. */
    private function inspectionAtManila(string $manilaMoment, string $number): Inspection
    {
        return Inspection::create([
            'inspection_number' => $number,
            'farm_id' => $this->farm->id,
            'inspection_type' => 'General Inspection',
            'status' => 'Completed',
            'scheduled_at' => Carbon::parse($manilaMoment, 'Asia/Manila')->utc(),
            'completed_at' => Carbon::parse($manilaMoment, 'Asia/Manila')->utc(),
        ]);
    }

    /** The bounds a report for a given Philippine month must actually query on. */
    private function monthBounds(string $firstDay): array
    {
        $start = LocalTime::startOfLocalDay($firstDay);

        return [$start, $start->copy()->endOfMonth()];
    }

    private function inspectionNumbersIn(array $snapshot): array
    {
        return collect($snapshot['completed_inspections'])->pluck('inspection_number')->all();
    }

    /** Manila month bounds convert to the expected UTC instants. */
    public function test_manila_month_bounds_map_to_the_right_utc_window(): void
    {
        [$start, $end] = $this->monthBounds('2026-09-01');

        $this->assertSame('2026-09-01 00:00:00', $start->toDateTimeString());
        $this->assertSame('Asia/Manila', $start->getTimezone()->getName());
        $this->assertSame('2026-08-31 16:00:00', $start->copy()->utc()->toDateTimeString());
        $this->assertSame('2026-09-30 15:59:59', $end->copy()->utc()->startOfSecond()->toDateTimeString());
    }

    /** 30 September 23:59:59 Manila is the last moment of the September report. */
    public function test_record_at_the_final_manila_second_is_included(): void
    {
        $this->inspectionAtManila('2026-09-30 23:59:59', 'INS-TZ-LAST');

        [$start, $end] = $this->monthBounds('2026-09-01');
        $snapshot = app(GeneratedReportService::class)->buildSnapshot($start, $end);

        $this->assertContains('INS-TZ-LAST', $this->inspectionNumbersIn($snapshot),
            '23:59:59 on 30 September in Manila must fall inside the September report');
    }

    /** 1 October 00:00:00 Manila belongs to October, not September. */
    public function test_record_at_the_first_manila_second_of_next_month_is_excluded(): void
    {
        $this->inspectionAtManila('2026-10-01 00:00:00', 'INS-TZ-NEXT');

        [$sepStart, $sepEnd] = $this->monthBounds('2026-09-01');
        $september = app(GeneratedReportService::class)->buildSnapshot($sepStart, $sepEnd);

        $this->assertNotContains('INS-TZ-NEXT', $this->inspectionNumbersIn($september),
            'midnight on 1 October in Manila must NOT be in the September report');

        [$octStart, $octEnd] = $this->monthBounds('2026-10-01');
        $october = app(GeneratedReportService::class)->buildSnapshot($octStart, $octEnd);

        $this->assertContains('INS-TZ-NEXT', $this->inspectionNumbersIn($october),
            'it belongs to October');
    }

    /** 1 September 00:00:00 Manila belongs to September, not August. */
    public function test_record_at_the_first_manila_second_of_the_month_is_included(): void
    {
        $this->inspectionAtManila('2026-09-01 00:00:00', 'INS-TZ-FIRST');

        [$sepStart, $sepEnd] = $this->monthBounds('2026-09-01');
        $september = app(GeneratedReportService::class)->buildSnapshot($sepStart, $sepEnd);

        $this->assertContains('INS-TZ-FIRST', $this->inspectionNumbersIn($september));

        [$augStart, $augEnd] = $this->monthBounds('2026-08-01');
        $august = app(GeneratedReportService::class)->buildSnapshot($augStart, $augEnd);

        $this->assertNotContains('INS-TZ-FIRST', $this->inspectionNumbersIn($august),
            'midnight on 1 September in Manila must NOT leak into the August report');
    }

    /** The same rule at the turn of the year. */
    public function test_year_boundary(): void
    {
        $this->inspectionAtManila('2026-12-31 23:59:59', 'INS-TZ-DEC');
        $this->inspectionAtManila('2027-01-01 00:00:00', 'INS-TZ-JAN');

        [$decStart, $decEnd] = $this->monthBounds('2026-12-01');
        $december = $this->inspectionNumbersIn(app(GeneratedReportService::class)->buildSnapshot($decStart, $decEnd));

        $this->assertContains('INS-TZ-DEC', $december);
        $this->assertNotContains('INS-TZ-JAN', $december);

        [$janStart, $janEnd] = $this->monthBounds('2027-01-01');
        $january = $this->inspectionNumbersIn(app(GeneratedReportService::class)->buildSnapshot($janStart, $janEnd));

        $this->assertContains('INS-TZ-JAN', $january);
        $this->assertNotContains('INS-TZ-DEC', $january);
    }

    /** Leap-year February runs to the 29th in Manila. */
    public function test_leap_year_february(): void
    {
        $this->inspectionAtManila('2028-02-29 23:59:59', 'INS-TZ-LEAP');

        [$start, $end] = $this->monthBounds('2028-02-01');

        $this->assertSame('2028-02-29', $end->toDateString());
        $this->assertContains('INS-TZ-LEAP',
            $this->inspectionNumbersIn(app(GeneratedReportService::class)->buildSnapshot($start, $end)));
    }

    /** Date-only columns keep their own calendar day under the new bounds. */
    public function test_date_only_fields_are_unaffected(): void
    {
        foreach (['2026-09-01', '2026-09-30'] as $day) {
            MaintenanceLog::create([
                'farm_id' => $this->farm->id,
                'maintenance_type' => 'Full Manure Clean-out',
                'performed_at' => $day,
                'notes' => 'TZ boundary '.$day,
                'photo_path' => 'maintenance/tz-test.png',
            ]);
        }

        [$start, $end] = $this->monthBounds('2026-09-01');
        $snapshot = app(GeneratedReportService::class)->buildSnapshot($start, $end);
        $dates = collect($snapshot['maintenance_completed'])->pluck('performed_at')->all();

        $this->assertContains('Sep 01, 2026', $dates, 'a clean-out on the 1st stays on the 1st');
        $this->assertContains('Sep 30, 2026', $dates, 'a clean-out on the 30th stays on the 30th');

        // And neither leaks into an adjacent month.
        [$augStart, $augEnd] = $this->monthBounds('2026-08-01');
        $august = collect(app(GeneratedReportService::class)->buildSnapshot($augStart, $augEnd)['maintenance_completed'])
            ->pluck('performed_at')->all();
        $this->assertNotContains('Sep 01, 2026', $august);
    }

    /** The stored period and printed cutoff stay Philippine calendar dates. */
    public function test_stored_period_and_cutoff_are_local_calendar_dates(): void
    {
        [$start, $end] = $this->monthBounds('2026-09-01');
        $snapshot = app(GeneratedReportService::class)->buildSnapshot($start, $end);

        $this->assertSame('2026-09-01', $start->toDateString(), 'period_start must persist as the local date');
        $this->assertSame('2026-09-30', $end->toDateString(), 'period_end must persist as the local date');
        $this->assertSame('Sep 30, 2026', $snapshot['status_as_of']);
        $this->assertSame('Sep 1–30, 2026', app(GeneratedReportService::class)->periodLabel($start, $end));
    }

    /** The scheduled command derives its month from the Philippine calendar. */
    public function test_command_uses_manila_month_boundaries(): void
    {
        if (GeneratedReport::whereDate('period_start', '2026-11-01')->exists()) {
            $this->markTestSkipped('Fixture already has a November 2026 archive.');
        }

        // 09:00 on 1 December in Manila — the moment the 01:00 UTC cron fires.
        Carbon::setTestNow(Carbon::parse('2026-12-01 01:00:00', 'UTC'));

        $this->artisan(GenerateMonthlyReport::class)->assertExitCode(0);

        $report = GeneratedReport::whereDate('period_start', '2026-11-01')->firstOrFail();

        $this->assertSame('2026-11-01', $report->period_start->toDateString());
        $this->assertSame('2026-11-30', $report->period_end->toDateString());
        $this->assertSame('Nov 30, 2026', $report->snapshot['status_as_of']);
    }

    /** An inspection in the boundary window lands in the month the command archives. */
    public function test_command_captures_the_local_boundary_window(): void
    {
        if (GeneratedReport::whereDate('period_start', '2026-11-01')->exists()) {
            $this->markTestSkipped('Fixture already has a November 2026 archive.');
        }

        // 23:30 on 30 November in Manila = 15:30 UTC — inside November locally,
        // and the UTC-bounded version kept it there too. The interesting one is
        // 00:30 on 1 December Manila = 16:30 UTC on 30 November, which the old
        // bounds wrongly counted as November.
        $this->inspectionAtManila('2026-11-30 23:30:00', 'INS-TZ-NOV-IN');
        $this->inspectionAtManila('2026-12-01 00:30:00', 'INS-TZ-DEC-OUT');

        Carbon::setTestNow(Carbon::parse('2026-12-01 01:00:00', 'UTC'));
        $this->artisan(GenerateMonthlyReport::class)->assertExitCode(0);

        $numbers = collect(GeneratedReport::whereDate('period_start', '2026-11-01')->firstOrFail()
            ->snapshot['completed_inspections'])->pluck('inspection_number')->all();

        $this->assertContains('INS-TZ-NOV-IN', $numbers);
        $this->assertNotContains('INS-TZ-DEC-OUT', $numbers,
            '00:30 on 1 December in Manila must not be archived as November activity');
    }
}
