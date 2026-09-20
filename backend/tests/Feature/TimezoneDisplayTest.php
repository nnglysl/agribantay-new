<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\GeneratedReport;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\GeneratedReportService;
use App\Support\LocalTime;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Timestamps are stored in UTC and displayed in Asia/Manila. These tests pin
 * that convention down, including the cases where the two disagree about what
 * day it is.
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=TimezoneDisplayTest
 *
 * Runs inside a rolled-back transaction; no stored timestamp is altered.
 */
class TimezoneDisplayTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=TimezoneDisplayTest');
        }
    }

    /** Storage stays UTC; only the display convention is local. */
    public function test_storage_is_utc_and_display_is_manila(): void
    {
        $this->assertSame('UTC', config('app.timezone'));
        $this->assertSame('Asia/Manila', LocalTime::timezone());
    }

    /** A UTC instant renders as the Manila wall-clock time. */
    public function test_utc_instants_render_in_manila_time(): void
    {
        $this->assertSame('Jul 19, 2026 3:04 AM', LocalTime::dateTime('2026-07-18 19:04:24'));
        $this->assertSame('Sep 11, 2026 8:35 PM', LocalTime::dateTime('2026-09-11 12:35:20'));
        $this->assertSame('Jan 01, 2026 8:00 AM', LocalTime::dateTime('2026-01-01 00:00:00'));
    }

    /** Anything stored 16:00-23:59 UTC belongs to the NEXT day locally. */
    public function test_records_near_midnight_roll_to_the_next_local_day(): void
    {
        // 15:59:59 UTC is still the same day in Manila (23:59:59).
        $this->assertSame('Sep 15, 2026', LocalTime::date('2026-09-15 15:59:59'));
        // 16:00:00 UTC is already the next day in Manila (00:00:00).
        $this->assertSame('Sep 16, 2026', LocalTime::date('2026-09-15 16:00:00'));
        $this->assertSame('Sep 16, 2026', LocalTime::date('2026-09-15 23:59:59'));
    }

    /** Month and year boundaries roll over with the local day. */
    public function test_month_and_year_boundaries(): void
    {
        $this->assertSame('Sep 30, 2026', LocalTime::date('2026-09-30 15:00:00'));
        $this->assertSame('Oct 01, 2026', LocalTime::date('2026-09-30 16:00:00'));
        $this->assertSame('Dec 31, 2026', LocalTime::date('2026-12-31 15:59:59'));
        $this->assertSame('Jan 01, 2027', LocalTime::date('2026-12-31 16:00:00'));
        // Leap day.
        $this->assertSame('Feb 29, 2028', LocalTime::date('2028-02-28 16:00:00'));
    }

    /** Null and empty values stay empty rather than becoming "now". */
    public function test_null_values_are_passed_through(): void
    {
        $this->assertNull(LocalTime::date(null));
        $this->assertNull(LocalTime::dateTime(null));
        $this->assertNull(LocalTime::date(''));
    }

    /**
     * The whole point: the API string and the browser's rendering of the raw
     * value must name the same calendar day. The browser converts the UTC
     * instant to Asia/Manila, so the backend must do the same.
     */
    public function test_api_output_matches_what_the_browser_will_render(): void
    {
        $samples = [
            '2026-07-18 19:04:24',
            '2026-09-11 20:35:20',
            '2026-07-20 23:20:13',
            '2026-09-15 08:00:00',
        ];

        foreach ($samples as $utc) {
            $backend = LocalTime::date($utc);
            // What `new Date(iso).toLocaleDateString(..., {timeZone:'Asia/Manila'})`
            // resolves to, expressed here with the same conversion.
            $browser = Carbon::parse($utc, 'UTC')->setTimezone('Asia/Manila')->format('M d, Y');

            $this->assertSame($browser, $backend, "backend and browser disagree for {$utc}");
        }
    }

    /** Report snapshot rows carry local dates, matching the on-screen lists. */
    public function test_report_snapshot_dates_are_local(): void
    {
        $alert = AlertHistory::whereRaw("HOUR(triggered_at) >= 16")->first();

        if (! $alert) {
            $this->markTestSkipped('No alert stored in the 16:00-23:59 UTC window to test with.');
        }

        $start = $alert->triggered_at->copy()->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $snapshot = app(GeneratedReportService::class)->buildSnapshot($start, $end);

        $row = collect($snapshot['alert_records'])
            ->firstWhere('triggered_at', LocalTime::dateTime($alert->triggered_at));

        $this->assertNotNull($row, 'the alert should appear with its local timestamp');
        $this->assertNotSame(
            $alert->triggered_at->format('M d, Y g:i A'),
            $row['triggered_at'],
            'a 16:00+ UTC alert must no longer print its raw UTC time'
        );
    }

    /**
     * Date-only columns carry no time of day and must never be shifted.
     * A clean-out logged on 31 July is 31 July, not 1 August.
     */
    public function test_date_only_fields_are_not_shifted(): void
    {
        $log = MaintenanceLog::whereNotNull('performed_at')->first();

        if (! $log) {
            $this->markTestSkipped('No maintenance log to test with.');
        }

        $start = $log->performed_at->copy()->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $snapshot = app(GeneratedReportService::class)->buildSnapshot($start, $end);

        $this->assertContains(
            $log->performed_at->format('M d, Y'),
            collect($snapshot['maintenance_completed'])->pluck('performed_at')->all(),
            'the clean-out date must appear exactly as stored, unshifted'
        );
    }

    /** Reporting period boundaries and archive counts are unaffected by the display change. */
    public function test_reporting_period_boundaries_are_unchanged(): void
    {
        $start = Carbon::parse('2026-09-01')->startOfDay();
        $end = Carbon::parse('2026-09-30')->endOfDay();

        $snapshot = app(GeneratedReportService::class)->buildSnapshot($start, $end);

        // Filtering still runs on the application clock, so the counts must
        // still equal a direct query over the same bounds.
        $this->assertSame(
            Inspection::where('status', 'Completed')->whereBetween('completed_at', [$start, $end])->count(),
            $snapshot['period_activity']['inspections_completed']
        );
        $this->assertSame(
            ServiceRequest::whereIn('service_type', ['Odor Control Request', 'Fly Control Request'])
                ->where('status', 'Completed')->whereBetween('completed_at', [$start, $end])->count(),
            $snapshot['period_activity']['services_completed']
        );
        $this->assertSame(
            AlertHistory::whereBetween('triggered_at', [$start, $end])->count(),
            $snapshot['period_activity']['alerts_recorded']
        );

        // Period label and cutoff are calendar dates — never timezone-shifted.
        $this->assertSame('Sep 1–30, 2026', app(GeneratedReportService::class)->periodLabel($start, $end));
        $this->assertSame('Sep 30, 2026', $snapshot['status_as_of']);
    }

    /** Alert ordering is by stored instant, so it cannot change with display. */
    public function test_alert_ordering_is_unaffected(): void
    {
        $ordered = AlertHistory::orderByDesc('triggered_at')->pluck('id')->all();
        $again = AlertHistory::latest('triggered_at')->pluck('id')->all();

        $this->assertSame($ordered, $again);
    }

    /** The archived reports' Date Generated is the real instant, shown locally. */
    public function test_generated_label_is_local_and_matches_stored_instant(): void
    {
        $report = GeneratedReport::orderBy('id')->first();

        if (! $report) {
            $this->markTestSkipped('No archived report to test with.');
        }

        $svc = app(GeneratedReportService::class);
        $expected = $report->created_at->copy()->setTimezone('Asia/Manila');

        $this->assertSame($expected->format('M d, Y'), $svc->generatedLabel($report->created_at, false));
        $this->assertStringContainsString($expected->format('g:i A'), $svc->generatedLabel($report->created_at));
        $this->assertStringEndsWith('PHT', $svc->generatedLabel($report->created_at));
    }

    /** A live API response renders its instants locally. */
    public function test_alert_history_endpoint_returns_local_times(): void
    {
        $admin = User::where('role', 'admin')->firstOrFail();
        $alert = AlertHistory::orderByDesc('triggered_at')->first();

        if (! $alert) {
            $this->markTestSkipped('No alert history to test with.');
        }

        $response = $this->actingAs($admin)->getJson('/api/admin/alert-history')->assertOk();

        $rows = collect($response->json('data') ?? $response->json());
        $this->assertNotEmpty($rows, 'alert history endpoint returned no rows');

        $this->assertContains(
            LocalTime::dateTime($alert->triggered_at),
            $rows->pluck('triggered_at')->all(),
            'the endpoint must emit the local rendering of the stored instant'
        );
    }
}
