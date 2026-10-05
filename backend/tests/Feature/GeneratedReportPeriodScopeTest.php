<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\GeneratedReport;
use App\Models\Inspection;
use App\Models\Sensor;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Services\GeneratedReportService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The report must describe the period it names, and nothing else.
 *
 * Every fixture below is created in a PAIR: one record inside the reporting
 * window and one clearly outside it. A figure that counts the whole table
 * instead of the window therefore comes back as 2 where the test wants 1, which
 * is the exact defect this covers — the snapshot used to print
 * Inspection::count(), SensorReading::count() and ServiceRequest::count() with
 * no date filter at all, so a September report carried all-time totals beside
 * period-filtered tables and the two contradicted each other on one page.
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=GeneratedReportPeriodScopeTest
 *
 * Runs inside a rolled-back transaction; no fixture survives.
 */
class GeneratedReportPeriodScopeTest extends TestCase
{
    use DatabaseTransactions;

    private Carbon $start;

    private Carbon $end;

    private Farm $farmIn;

    private array $snapshot;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=GeneratedReportPeriodScopeTest');
        }

        Http::fake();

        // A fixed window in the past, so the test never depends on today.
        $this->start = Carbon::parse('2026-03-01')->startOfDay();
        $this->end = Carbon::parse('2026-03-31')->endOfDay();

        $inside = Carbon::parse('2026-03-15 09:00:00');
        $outside = Carbon::parse('2026-05-15 09:00:00');

        // Anything already in the database would be counted alongside the
        // fixtures and make the arithmetic depend on the seed.
        Farm::query()->update(['status' => 'Inactive']);

        // --- accounts: one of each role inside, one farm owner outside
        foreach (['farm_owner', 'admin', 'vet', 'super_admin'] as $role) {
            $this->makeUser($role, $inside);
        }
        $ownerOutside = $this->makeUser('farm_owner', $outside);

        // --- farms: one in, one out
        $this->farmIn = $this->makeFarm($this->makeUser('farm_owner', $inside), 'Period Farm In', $inside);
        $farmOut = $this->makeFarm($ownerOutside, 'Period Farm Out', $outside);

        // --- devices: one in, one out
        $this->makeSensor($this->farmIn, $inside);
        $this->makeSensor($farmOut, $outside);

        // --- inspections: four inside covering every status plus one overdue,
        //     one outside. The overdue one is Scheduled with a date already
        //     past when the window closed.
        $this->makeInspection($this->farmIn, 'Scheduled', $inside->copy()->addDays(10), null);
        $this->makeInspection($this->farmIn, 'Scheduled', $inside->copy()->subDays(5), null);  // overdue
        $this->makeInspection($this->farmIn, 'Completed', $inside, $inside);
        $this->makeInspection($this->farmIn, 'Cancelled', $inside, null);
        $this->makeInspection($farmOut, 'Completed', $outside, $outside);

        // --- service requests: one of each status inside, one outside
        foreach (['Pending', 'Scheduled', 'Completed', 'Cancelled'] as $status) {
            $this->makeServiceRequest($this->farmIn, $status, $inside);
        }
        $this->makeServiceRequest($farmOut, 'Completed', $outside);

        // --- alerts: one resolved inside, one still open, one outside
        $this->makeAlert($this->farmIn, 'Critical', $inside, $inside->copy()->addHour());
        $this->makeAlert($this->farmIn, 'Warning', $inside, null);
        $this->makeAlert($farmOut, 'Critical', $outside, null);

        $this->snapshot = app(GeneratedReportService::class)->buildSnapshot($this->start, $this->end);
    }

    private function makeUser(string $role, Carbon $createdAt): User
    {
        $user = User::create([
            'first_name' => 'Period',
            'last_name' => Str::random(6),
            'email' => Str::lower(Str::random(10)).'@agribantay.test',
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password' => bcrypt('password'),
            'role' => $role,
            'status' => 'active',
        ]);

        $user->forceFill(['created_at' => $createdAt])->saveQuietly();

        return $user->fresh();
    }

    private function makeFarm(User $owner, string $name, Carbon $createdAt): Farm
    {
        $farm = Farm::create([
            'user_id' => $owner->id,
            'farm_name' => $name.' '.Str::random(4),
            'owner_name' => $owner->first_name.' '.$owner->last_name,
            'barangay' => 'Calansayan',
            'municipality' => 'San Jose',
            'province' => 'Batangas',
            'address' => 'Calansayan, San Jose, Batangas',
            'farm_size' => 'Small',
            'status' => 'Active',
        ]);

        $farm->forceFill(['created_at' => $createdAt])->saveQuietly();

        return $farm->fresh();
    }

    private function makeSensor(Farm $farm, Carbon $createdAt): Sensor
    {
        $sensor = Sensor::create([
            'farm_id' => $farm->id,
            'device_key' => 'TEST-'.Str::upper(Str::random(10)),
            'label' => 'Test Device '.Str::random(4),
            'status' => 'Active',
            'sensor_code' => 'TC-'.Str::upper(Str::random(5)),
        ]);

        $sensor->forceFill(['created_at' => $createdAt])->saveQuietly();

        return $sensor->fresh();
    }

    private function makeInspection(Farm $farm, string $status, Carbon $scheduledAt, ?Carbon $completedAt): Inspection
    {
        return Inspection::create([
            'inspection_number' => 'INS-'.Str::upper(Str::random(8)),
            'farm_id' => $farm->id,
            'inspection_type' => 'General Inspection',
            'status' => $status,
            'scheduled_at' => $scheduledAt,
            'completed_at' => $completedAt,
        ]);
    }

    private function makeServiceRequest(Farm $farm, string $status, Carbon $createdAt): ServiceRequest
    {
        $r = ServiceRequest::create([
            'request_number' => 'SR-'.Str::upper(Str::random(8)),
            'requested_by' => $farm->user_id,
            'farm_id' => $farm->id,
            'service_type' => 'Odor Control Request',
            'status' => $status,
            'completed_at' => $status === 'Completed' ? $createdAt : null,
        ]);

        $r->forceFill(['created_at' => $createdAt])->saveQuietly();

        return $r->fresh();
    }

    private function makeAlert(Farm $farm, string $status, Carbon $triggeredAt, ?Carbon $resolvedAt): AlertHistory
    {
        return AlertHistory::create([
            'farm_id' => $farm->id,
            'sensor_type' => 'ammonia',
            'status' => $status,
            'value' => 42,
            'triggered_at' => $triggeredAt,
            'resolved_at' => $resolvedAt,
        ]);
    }

    public function test_new_accounts_count_only_those_created_in_the_period(): void
    {
        $this->assertSame(
            [
                'farm_owners' => 2,   // one standalone + the owner of the in-period farm
                'staff' => 1,
                'vets' => 1,
                'super_admins' => 1,
                'total' => 5,
            ],
            $this->snapshot['new_accounts'],
            'New accounts must exclude the owner created outside the window.'
        );
    }

    public function test_new_farms_and_devices_count_only_those_registered_in_the_period(): void
    {
        $this->assertSame(1, $this->snapshot['new_farms']['count']);
        $this->assertCount(1, $this->snapshot['new_farms']['list']);
        $this->assertStringContainsString('Period Farm In', $this->snapshot['new_farms']['list'][0]['farm_name']);

        $this->assertSame(1, $this->snapshot['new_devices']['count']);
        $this->assertCount(1, $this->snapshot['new_devices']['list']);
    }

    public function test_inspection_summary_is_period_scoped_and_derives_overdue(): void
    {
        $this->assertSame(
            [
                'total' => 4,
                'scheduled' => 2,
                'completed' => 1,
                'cancelled' => 1,
                // BOTH Scheduled visits, because this period closed in March
                // and neither was ever carried out. Overdue is a view of the
                // Scheduled rows, not a fifth bucket — total stays 4. The
                // future-dated case is covered by its own test below.
                'overdue' => 2,
            ],
            $this->snapshot['inspection_period']
        );

        $byFarm = collect($this->snapshot['inspection_farm_summary']);
        $this->assertCount(1, $byFarm, 'Only the in-period farm ran inspections in the window.');
        $this->assertSame(4, $byFarm->first()['total']);
        $this->assertSame(2, $byFarm->first()['overdue']);
    }

    public function test_service_request_summary_uses_the_real_statuses_and_the_period(): void
    {
        $this->assertSame(
            [
                'total' => 4,
                'pending' => 1,
                'scheduled' => 1,
                'completed' => 1,
                'cancelled' => 1,
            ],
            $this->snapshot['service_request_period'],
            'The request completed outside the window must not be counted.'
        );
    }

    public function test_alert_summary_counts_the_period_and_splits_resolution_at_the_cutoff(): void
    {
        $this->assertSame(
            [
                'total' => 2,
                'critical' => 1,
                'warning' => 1,
                'resolved' => 1,
                'ongoing' => 1,
            ],
            $this->snapshot['alert_period']
        );

        // Nothing is double counted: the two resolution buckets partition the
        // total, and so do the two severities.
        $a = $this->snapshot['alert_period'];
        $this->assertSame($a['total'], $a['resolved'] + $a['ongoing']);
        $this->assertSame($a['total'], $a['critical'] + $a['warning']);

        $byFarm = collect($this->snapshot['alert_farm_summary']);
        $this->assertCount(1, $byFarm);
        $this->assertSame(2, $byFarm->first()['total']);
        $this->assertSame(1, $byFarm->first()['resolved']);
        $this->assertSame(1, $byFarm->first()['ongoing']);
    }

    public function test_compliance_is_a_position_at_the_cutoff_not_period_activity(): void
    {
        $c = $this->snapshot['compliance_period'];

        // The farm registered AFTER the window did not exist in the period and
        // must not appear in its compliance position.
        $this->assertSame(1, $c['total_farms']);
        $this->assertSame(
            $c['total_farms'],
            $c['compliant'] + $c['overdue'] + $c['non_compliant'],
            'Every farm must fall in exactly one compliance bucket.'
        );
    }

    public function test_a_visit_still_ahead_of_today_is_not_overdue(): void
    {
        // A period running to the end of NEXT month, holding one visit booked
        // for a date that has not arrived. Measuring overdue against the period
        // end would call it missed; measuring against today does not.
        $future = now()->addDays(10);

        $this->makeInspection($this->farmIn, 'Scheduled', $future, null);

        $snap = app(GeneratedReportService::class)->buildSnapshot(
            now()->copy()->startOfMonth(),
            now()->copy()->addMonth()->endOfMonth()
        );

        $this->assertSame(1, $snap['inspection_period']['scheduled']);
        $this->assertSame(0, $snap['inspection_period']['overdue'], 'A date that has not arrived cannot have been missed.');
    }

    /**
     * A generated report is a historical document. Adding sections to the
     * builder must not reach back and alter one that was already archived.
     */
    public function test_an_already_archived_report_is_not_touched_by_the_new_sections(): void
    {
        // A snapshot in the shape the builder produced BEFORE the period
        // sections existed: the all-time summaries, and none of the new keys.
        $archivedSnapshot = [
            'period' => ['start' => '2026-01-01 00:00:00', 'end' => '2026-01-31 23:59:59'],
            'status_as_of' => 'Jan 31, 2026',
            'inspection_summary' => ['total' => 11, 'completed' => 7, 'scheduled' => 4, 'general' => 9, 'follow_up' => 2],
            'alert_summary' => ['total' => 1234, 'ammonia_breaches' => 5, 'critical_alerts' => 5],
            'service_summary' => ['total' => 3, 'completed' => 2, 'pending' => 1],
            'maintenance_summary' => ['completed_this_month' => 1, 'overdue' => 2, 'non_compliant' => 3],
            'alert_farm_summary' => [
                ['farm_name' => 'Archived Farm', 'owner_name' => 'Someone', 'ammonia' => 2,
                    'moisture' => 0, 'critical' => 1, 'warning' => 1, 'total' => 2],
            ],
            'completed_inspections' => [],
            'alert_records' => [],
        ];

        $archived = GeneratedReport::create([
            'report_name' => 'Archived Report '.Str::random(5),
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-31',
            'report_type' => 'Monthly',
            'generated_by_id' => null,
            'snapshot' => $archivedSnapshot,
        ]);

        // Generating a NEW report runs the whole updated builder.
        app(GeneratedReportService::class)->generateForPeriod(
            'Fresh Report '.Str::random(5),
            $this->start,
            $this->end,
            null,
            'Monthly'
        );

        $reloaded = GeneratedReport::findOrFail($archived->id);

        // assertEquals, not assertSame: the snapshot round-trips through a
        // JSON column, which preserves every key and value but not the order
        // they were written in. Order carries no meaning here — the document is
        // rendered from named keys — so comparing content is the real check,
        // and demanding an order the storage never promised would fail on a
        // report that had not changed at all.
        $this->assertEquals(
            $archivedSnapshot,
            $reloaded->snapshot,
            'An archived snapshot was altered. Generated reports are frozen documents.'
        );

        // And specifically: none of the new keys appeared in it.
        foreach (['new_accounts', 'new_farms', 'new_devices', 'inspection_period',
            'service_request_period', 'alert_period', 'compliance_period'] as $key) {
            $this->assertArrayNotHasKey($key, $reloaded->snapshot);
        }

        // The old alert rows gained no resolution columns either, which is what
        // keeps the report view printing its original six.
        $this->assertArrayNotHasKey('resolved', $reloaded->snapshot['alert_farm_summary'][0]);
    }

    public function test_a_wider_window_sees_more_than_a_narrower_one(): void
    {
        // The strongest statement the test can make about scoping: widening the
        // window to cover the "outside" fixtures brings them in. A figure that
        // ignored the dates would be identical in both snapshots.
        $wide = app(GeneratedReportService::class)->buildSnapshot(
            Carbon::parse('2026-03-01')->startOfDay(),
            Carbon::parse('2026-06-30')->endOfDay()
        );

        $this->assertSame(2, $wide['new_farms']['count']);
        $this->assertSame(2, $wide['new_devices']['count']);
        $this->assertSame(6, $wide['new_accounts']['total']);
        $this->assertSame(5, $wide['inspection_period']['total']);
        $this->assertSame(5, $wide['service_request_period']['total']);
        $this->assertSame(3, $wide['alert_period']['total']);

        $this->assertGreaterThan($this->snapshot['new_farms']['count'], $wide['new_farms']['count']);
    }
}
