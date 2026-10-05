<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Recent Alerts / Alert History: the Triggered column and its ordering.
 *
 * The display string is for reading; triggered_at_raw is what the frontend
 * sorts on. Before it existed the list could only be reversed, which stood in
 * for sorting and held only while the backend order was never disturbed.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AlertHistoryOrderingTest
 */
class AlertHistoryOrderingTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AlertHistoryOrderingTest');
        }

        Http::fake();

        $this->admin = User::where('role', 'admin')->firstOrFail();

        $owner = User::create([
            'first_name'    => 'Alert',
            'last_name'     => Str::random(6),
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password'      => bcrypt('x'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        $this->farm = Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => 'Alert Test Farm',
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Aya',
            'address'       => 'x',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    /** $utc is stored as-is; the API is expected to render it in Manila time. */
    private function alert(string $utc, string $status = 'Critical'): AlertHistory
    {
        return AlertHistory::create([
            'farm_id'             => $this->farm->id,
            'sensor_type'         => 'ammonia',
            'status'              => $status,
            'value'               => 42.5,
            'triggered_at'        => Carbon::parse($utc, 'UTC'),
            'safe_readings_count' => 0,
        ]);
    }

    private function rows(): array
    {
        return $this->actingAs($this->admin)
            ->getJson('/api/admin/alert-history?'.http_build_query(['farm_id' => $this->farm->id]))
            ->assertOk()
            ->json('data');
    }

    public function test_triggered_at_is_rendered_in_manila_time(): void
    {
        // 02:45 UTC is 10:45 AM in Manila (UTC+8).
        $this->alert('2026-10-01 02:45:00');

        $row = $this->rows()[0];

        $this->assertSame('Oct 01, 2026 10:45 AM', $row['triggered_at']);
    }

    public function test_the_raw_instant_is_sent_alongside_the_display_string(): void
    {
        $this->alert('2026-10-01 02:45:00');

        $row = $this->rows()[0];

        $this->assertArrayHasKey('triggered_at_raw', $row);

        // Parseable, and the same moment the display string describes.
        $parsed = Carbon::parse($row['triggered_at_raw']);
        $this->assertSame('2026-10-01 02:45:00', $parsed->utc()->format('Y-m-d H:i:s'));
    }

    public function test_alerts_come_back_newest_first(): void
    {
        // Inserted out of order on purpose: row order must come from
        // triggered_at, not from insertion order or id.
        $this->alert('2026-10-01 01:55:00');   // 09:55 AM
        $this->alert('2026-10-01 02:45:00');   // 10:45 AM
        $this->alert('2026-10-01 02:20:00');   // 10:20 AM

        $triggered = array_column($this->rows(), 'triggered_at');

        // Hour has no leading zero — LocalTime formats with 'g', not 'h'.
        $this->assertSame([
            'Oct 01, 2026 10:45 AM',
            'Oct 01, 2026 10:20 AM',
            'Oct 01, 2026 9:55 AM',
        ], $triggered);
    }

    public function test_raw_instants_are_strictly_descending(): void
    {
        $this->alert('2026-09-30 23:10:00');
        $this->alert('2026-10-01 02:45:00');
        $this->alert('2026-10-01 00:05:00');

        $stamps = array_map(
            fn ($row) => Carbon::parse($row['triggered_at_raw'])->getTimestamp(),
            $this->rows()
        );

        $sorted = $stamps;
        rsort($sorted);

        $this->assertSame($sorted, $stamps, 'rows are not ordered newest first');
    }

    /**
     * A date that crosses midnight in Manila but not in UTC: the display must
     * follow the local day, which is what staff read off the screen.
     */
    public function test_an_alert_late_in_the_utc_day_shows_the_next_manila_day(): void
    {
        $this->alert('2026-10-01 16:30:00');   // 00:30 AM on Oct 2 in Manila

        $this->assertSame('Oct 02, 2026 12:30 AM', $this->rows()[0]['triggered_at']);
    }

    public function test_an_unresolved_alert_reports_no_resolved_instant(): void
    {
        $this->alert('2026-10-01 02:45:00');

        $row = $this->rows()[0];

        $this->assertTrue($row['is_ongoing']);
        $this->assertNull($row['resolved_at']);
        $this->assertNull($row['resolved_at_raw']);
    }
}
