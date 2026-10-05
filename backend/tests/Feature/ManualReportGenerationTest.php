<?php

namespace Tests\Feature;

use App\Models\GeneratedReport;
use App\Models\SensorReading;
use App\Models\User;
use App\Support\LocalTime;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * On-demand report generation: Daily, Weekly, Monthly and Custom.
 *
 * Reports were only ever produced by a scheduled monthly command. On shared
 * hosting with no cron it never ran, so no report existed for September 2026
 * and nothing in the UI could create one. Generation is now a user action and
 * the chosen period kind is stored with the archive.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ManualReportGenerationTest
 */
class ManualReportGenerationTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ManualReportGenerationTest');
        }

        Http::fake();

        $this->admin = User::where('role', 'super_admin')->firstOrFail();
    }

    private function generate(array $payload)
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($this->admin)->postJson('/api/admin/generated-reports', $payload);
    }

    /** A period far enough back that the fixtures hold no archive for it. */
    private function freeMonth(): Carbon
    {
        $candidate = Carbon::create(2024, 1, 1);

        while (GeneratedReport::whereDate('period_start', $candidate->toDateString())->exists()) {
            $candidate->addMonth();
        }

        return $candidate;
    }

    public function test_a_past_month_can_be_generated_on_demand(): void
    {
        $month = $this->freeMonth();

        $id = $this->generate([
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        $report = GeneratedReport::findOrFail($id);

        $this->assertSame($month->toDateString(), $report->period_start->toDateString());
        $this->assertSame($month->copy()->endOfMonth()->toDateString(), $report->period_end->toDateString());
        $this->assertSame('Monthly', $report->report_type);
    }

    public function test_a_month_does_not_bleed_into_the_next_one(): void
    {
        $month = $this->freeMonth();
        $end   = $month->copy()->endOfMonth();

        $id = $this->generate([
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $end->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        $period = GeneratedReport::findOrFail($id)->snapshot['period'];

        // The stored window must stop at the final local day of the month.
        $this->assertStringStartsWith($month->format('Y-m'), $period['start']);
        $this->assertStringStartsWith($end->format('Y-m-d'), $period['end']);
    }

    public function test_a_daily_report_covers_a_single_day(): void
    {
        $day = Carbon::now(LocalTime::timezone())->subDays(3)->toDateString();

        $id = $this->generate([
            'report_name'  => "Daily {$day} ".Str::random(4),
            'period_start' => $day,
            'period_end'   => $day,
            'report_type'  => 'Daily',
        ])->assertStatus(201)->json('data.id');

        $report = GeneratedReport::findOrFail($id);

        $this->assertSame($day, $report->period_start->toDateString());
        $this->assertSame($day, $report->period_end->toDateString());
        $this->assertSame('Daily', $report->report_type);
    }

    public function test_a_weekly_report_stores_its_seven_day_span(): void
    {
        $end   = Carbon::now(LocalTime::timezone())->subWeek()->endOfWeek();
        $start = $end->copy()->subDays(6);

        $id = $this->generate([
            'report_name'  => 'Weekly '.Str::random(5),
            'period_start' => $start->toDateString(),
            'period_end'   => $end->toDateString(),
            'report_type'  => 'Weekly',
        ])->assertStatus(201)->json('data.id');

        $report = GeneratedReport::findOrFail($id);

        $this->assertSame(6, (int) $report->period_start->diffInDays($report->period_end));
        $this->assertSame('Weekly', $report->report_type);
    }

    public function test_a_custom_range_is_stored_exactly_as_submitted(): void
    {
        $start = Carbon::create(2024, 6, 7);
        $end   = Carbon::create(2024, 6, 19);

        $id = $this->generate([
            'report_name'  => 'Custom '.Str::random(5),
            'period_start' => $start->toDateString(),
            'period_end'   => $end->toDateString(),
            'report_type'  => 'Custom',
        ])->assertStatus(201)->json('data.id');

        $report = GeneratedReport::findOrFail($id);

        $this->assertSame('2024-06-07', $report->period_start->toDateString());
        $this->assertSame('2024-06-19', $report->period_end->toDateString());
        $this->assertSame('Custom', $report->report_type);
    }

    public function test_a_backwards_range_is_rejected(): void
    {
        $this->generate([
            'report_name'  => 'Backwards '.Str::random(4),
            'period_start' => '2024-06-19',
            'period_end'   => '2024-06-07',
            'report_type'  => 'Custom',
        ])->assertStatus(422)->assertJsonValidationErrors('period_end');
    }

    public function test_an_unknown_period_kind_is_rejected(): void
    {
        $month = $this->freeMonth();

        $this->generate([
            'report_name'  => 'Bad Type '.Str::random(4),
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Hourly',
        ])->assertStatus(422)->assertJsonValidationErrors('report_type');
    }

    public function test_the_snapshot_is_frozen_once_generated(): void
    {
        $month = $this->freeMonth();

        $id = $this->generate([
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        $before = GeneratedReport::findOrFail($id)->snapshot;

        // Reading it back must return the stored figures, not a recalculation.
        $this->app['auth']->forgetGuards();
        $shown = $this->actingAs($this->admin)
            ->getJson("/api/admin/generated-reports/{$id}")
            ->assertOk()
            ->json('data.snapshot');

        $this->assertSame($before['period_activity'], $shown['period_activity']);
    }

    public function test_the_list_puts_the_newest_generated_report_first(): void
    {
        $first  = $this->freeMonth();
        $this->generate([
            'report_name'  => $first->format('F Y').' Report',
            'period_start' => $first->toDateString(),
            'period_end'   => $first->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201);

        // An OLDER period, generated second — it must still come out on top,
        // which ordering by period_start alone would get wrong.
        $older = Carbon::create(2023, 2, 1);
        while (GeneratedReport::whereDate('period_start', $older->toDateString())->exists()) {
            $older->addMonth();
        }

        $secondId = $this->generate([
            'report_name'  => $older->format('F Y').' Report',
            'period_start' => $older->toDateString(),
            'period_end'   => $older->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        $this->app['auth']->forgetGuards();
        $rows = $this->actingAs($this->admin)->getJson('/api/admin/generated-reports')->assertOk()->json('data');

        $this->assertSame($secondId, $rows[0]['id'], 'the most recently generated report must be first');
    }

    public function test_the_signature_names_are_frozen_into_the_snapshot(): void
    {
        $month = $this->freeMonth();

        $id = $this->generate([
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        $sig = GeneratedReport::findOrFail($id)->snapshot['signatures'];

        // $this->admin is the Super Admin, i.e. the Head. A report he
        // generates himself carries ONE signature — printing his name as both
        // preparer and noter reads as a mistake on an official document.
        $expected = trim($this->admin->first_name.' '.$this->admin->last_name);
        $this->assertNull($sig['prepared_by']);
        $this->assertSame($expected, $sig['noted_by']['name']);
        $this->assertSame('Head, Agriculture Office', $sig['noted_by']['title']);
    }

    /** Anyone other than the Head is still named as the preparer. */
    public function test_a_staff_report_keeps_both_signatures(): void
    {
        $staff = User::where('role', 'admin')->firstOrFail();
        $month = $this->freeMonth();

        $this->app['auth']->forgetGuards();
        $id = $this->actingAs($staff)
            ->postJson('/api/admin/generated-reports', [
                'report_name'  => $month->format('F Y').' Report',
                'period_start' => $month->toDateString(),
                'period_end'   => $month->copy()->endOfMonth()->toDateString(),
                'report_type'  => 'Monthly',
            ])
            ->assertStatus(201)
            ->json('data.id');

        $sig = GeneratedReport::findOrFail($id)->snapshot['signatures'];

        $this->assertSame(trim($staff->first_name.' '.$staff->last_name), $sig['prepared_by']['name']);
        $this->assertSame('LGU Staff', $sig['prepared_by']['title']);
        $this->assertSame('Head, Agriculture Office', $sig['noted_by']['title']);
        $this->assertNotNull($sig['noted_by']['name']);
    }

    /**
     * The whole reason the names are stored as text: generated_by_id is SET
     * NULL when an account goes, and an official document must not lose its
     * author because the person later left.
     */
    public function test_the_prepared_by_name_survives_the_account_being_deleted(): void
    {
        $staff = User::create([
            'first_name'    => 'Temp',
            'last_name'     => 'Reporter',
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password'      => bcrypt('x'),
            'role'          => 'admin',
            'status'        => 'active',
        ]);

        $month = $this->freeMonth();
        $this->app['auth']->forgetGuards();

        $id = $this->actingAs($staff)->postJson('/api/admin/generated-reports', [
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        $staff->delete();

        $report = GeneratedReport::findOrFail($id);

        $this->assertNull($report->generated_by_id, 'the FK should have been nulled');
        $this->assertSame('Temp Reporter', $report->snapshot['signatures']['prepared_by']['name']);
        $this->assertSame('LGU Staff', $report->snapshot['signatures']['prepared_by']['title']);
    }

    /**
     * One table backs every module, so a report must belong to the person who
     * generated it — otherwise a staff member's archive also turned up in the
     * Vet's list, looking like a second report that nobody had made.
     */
    public function test_a_report_is_only_listed_for_the_person_who_generated_it(): void
    {
        $month = $this->freeMonth();

        $id = $this->generate([
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        // The generator sees it.
        $this->app['auth']->forgetGuards();
        $mine = $this->actingAs($this->admin)->getJson('/api/admin/generated-reports')->assertOk()->json('data');
        $this->assertContains($id, array_column($mine, 'id'));

        // Another staff member does not.
        $other = User::where('role', 'admin')->firstOrFail();
        $this->app['auth']->forgetGuards();
        $theirs = $this->actingAs($other)->getJson('/api/admin/generated-reports')->assertOk()->json('data');
        $this->assertNotContains($id, array_column($theirs, 'id'));

        // And neither does the Vet.
        $vet = User::where('role', 'vet')->firstOrFail();
        $this->app['auth']->forgetGuards();
        $vetList = $this->actingAs($vet)->getJson('/api/vet/generated-reports')->assertOk()->json('data');
        $this->assertNotContains($id, array_column($vetList, 'id'));
    }

    public function test_another_user_cannot_open_a_report_by_id(): void
    {
        $month = $this->freeMonth();

        $id = $this->generate([
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        // Hiding it from the list is not enough if the id still opens it.
        $vet = User::where('role', 'vet')->firstOrFail();
        $this->app['auth']->forgetGuards();
        $this->actingAs($vet)->getJson("/api/vet/generated-reports/{$id}")->assertStatus(404);
    }

    public function test_a_vet_cannot_generate_reports(): void
    {
        $vet   = User::where('role', 'vet')->firstOrFail();
        $month = $this->freeMonth();

        $this->app['auth']->forgetGuards();
        $this->actingAs($vet)
            ->postJson('/api/admin/generated-reports', [
                'report_name'  => 'Vet Attempt '.Str::random(4),
                'period_start' => $month->toDateString(),
                'period_end'   => $month->copy()->endOfMonth()->toDateString(),
                'report_type'  => 'Monthly',
            ])
            ->assertStatus(403);
    }

    /**
     * The duplicate guard is per person, not per system.
     *
     * It used to query the whole table, so the Vet — whose own archive list
     * was empty — was told that "September 2026 Report, id 210" already
     * existed and was refused, by a staff member's report the Vet cannot see,
     * open or delete. Each module keeps its own archive, so the same period
     * has to be generatable once in each.
     */
    public function test_another_modules_archive_does_not_block_generation(): void
    {
        $month = $this->freeMonth();
        $payload = [
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ];

        $this->generate($payload)->assertStatus(201);

        // Same period, different module: allowed.
        $vet = User::where('role', 'vet')->firstOrFail();
        $this->app['auth']->forgetGuards();
        $this->actingAs($vet)
            ->postJson('/api/vet/generated-reports', $payload)
            ->assertStatus(201);

        // ...but a second time in the Vet's own list is still refused.
        $this->app['auth']->forgetGuards();
        $this->actingAs($vet)
            ->postJson('/api/vet/generated-reports', $payload)
            ->assertStatus(409);
    }

    /**
     * The per-farm summary must agree with the incident list it replaces.
     *
     * The printed report shows one row per farm instead of one per incident —
     * 81 incidents ran to six pages. Both are kept in the snapshot, so the
     * risk is that they drift and the report contradicts its own CSV export.
     */
    public function test_the_alert_summary_adds_up_to_the_incident_list(): void
    {
        $month = $this->freeMonth();

        $id = $this->generate([
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        $snapshot = GeneratedReport::findOrFail($id)->snapshot;

        $this->assertArrayHasKey('alert_farm_summary', $snapshot);

        $records = $snapshot['alert_records'];
        $summary = $snapshot['alert_farm_summary'];

        // One row per farm, never one per incident.
        $this->assertSame(
            count(array_unique(array_column($records, 'farm_name'))),
            count($summary),
            'the summary must hold exactly one row per farm that raised an alert'
        );

        $this->assertSame(count($records), array_sum(array_column($summary, 'total')));

        // No "Ongoing" column: a frozen snapshot cannot keep that true.
        foreach ($summary as $row) {
            $this->assertArrayNotHasKey('ongoing', $row);
        }

        // Worst farm first, so the one needing attention is read first.
        $totals = array_column($summary, 'total');
        $sorted = $totals;
        rsort($sorted);
        $this->assertSame($sorted, $totals);
    }

    /**
     * The sensor summary counts only the metrics the system alerts on.
     *
     * It used to count ammonia, temperature and humidity — and NOT moisture,
     * one of the two that actually alert. Temperature dominated the figure
     * because its safe band is a temperate-climate one, so the report printed
     * roughly 13,000 "critical" readings a few lines above an alert table
     * listing a handful of incidents.
     */
    public function test_the_sensor_summary_counts_only_alerting_metrics(): void
    {
        $month = $this->freeMonth();

        $id = $this->generate([
            'report_name'  => $month->format('F Y').' Report',
            'period_start' => $month->toDateString(),
            'period_end'   => $month->copy()->endOfMonth()->toDateString(),
            'report_type'  => 'Monthly',
        ])->assertStatus(201)->json('data.id');

        $summary = GeneratedReport::findOrFail($id)->snapshot['alert_summary'];

        $this->assertArrayHasKey('moisture_breaches', $summary);

        // The headline figure must equal the rows where an ALERTING metric is
        // Critical — computed here straight from the table, so a future change
        // to the query cannot quietly widen it again.
        $expected = SensorReading::where(function ($q) {
            $q->where('ammonia_status', 'Critical')
                ->orWhere('moisture_status', 'Critical');
        })->count();

        $this->assertSame($expected, $summary['critical_alerts']);

        // It can never exceed the total number of readings, which the old
        // temperature-driven count came close to doing.
        $this->assertLessThanOrEqual($summary['total'], $summary['critical_alerts']);
    }
}
