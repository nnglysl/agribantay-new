<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Activity Logs: the "Time" column.
 *
 * It used to carry diffForHumans() — "3 days ago" — so the one question an
 * audit trail has to answer, WHEN an action was taken, had no answer on the
 * screen. It now carries a real Manila date and time, with the relative
 * wording kept as a separate field.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ActivityLogTimestampTest
 */
class ActivityLogTimestampTest extends TestCase
{
    use DatabaseTransactions;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ActivityLogTimestampTest');
        }

        Http::fake();

        $this->superAdmin = User::where('role', 'super_admin')->firstOrFail();
    }

    private function logAt(string $utc): ActivityLog
    {
        $log = ActivityLog::create([
            'user_id' => $this->superAdmin->id,
            'role'    => 'super_admin',
            'action'  => 'Timestamp Probe '.Str::random(5),
            'details' => 'probe',
            'type'    => 'Account',
        ]);

        // created_at is managed by Eloquent, so it is forced afterwards.
        $log->forceFill(['created_at' => Carbon::parse($utc, 'UTC')])->save();

        return $log->fresh();
    }

    private function rowFor(ActivityLog $log): array
    {
        $rows = $this->actingAs($this->superAdmin)
            ->getJson('/api/superadmin/activity-logs')
            ->assertOk()
            ->json('data');

        $row = collect($rows)->firstWhere('id', $log->id);

        $this->assertNotNull($row, 'the log did not come back from the endpoint');

        return $row;
    }

    public function test_time_column_is_a_real_date_and_time_in_manila(): void
    {
        // 19:05 UTC on Sep 27 is 3:05 AM on Sep 28 in Manila. The local day is
        // what staff read, so it must say the 28th — not the 27th.
        $row = $this->rowFor($this->logAt('2026-09-27 19:05:00'));

        $this->assertSame('Sep 28, 2026 3:05 AM', $row['created_at']);
    }

    public function test_the_time_column_is_no_longer_relative_wording(): void
    {
        $row = $this->rowFor($this->logAt('2026-09-27 19:05:00'));

        $this->assertStringNotContainsString('ago', $row['created_at']);
    }

    public function test_relative_wording_is_still_available_separately(): void
    {
        $row = $this->rowFor($this->logAt('2026-09-27 19:05:00'));

        $this->assertArrayHasKey('created_at_relative', $row);
        $this->assertStringContainsString('ago', $row['created_at_relative']);
    }

    public function test_the_raw_instant_is_still_sent_for_filtering(): void
    {
        $row = $this->rowFor($this->logAt('2026-09-27 19:05:00'));

        $this->assertSame(
            '2026-09-27 19:05:00',
            Carbon::parse($row['created_at_raw'])->utc()->format('Y-m-d H:i:s')
        );
    }

    public function test_a_midday_entry_keeps_its_own_day(): void
    {
        // 04:30 UTC is 12:30 PM the same day in Manila — no day shift here.
        $row = $this->rowFor($this->logAt('2026-09-28 04:30:00'));

        $this->assertSame('Sep 28, 2026 12:30 PM', $row['created_at']);
    }
}
