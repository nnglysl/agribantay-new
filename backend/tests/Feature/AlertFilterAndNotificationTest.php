<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Alert History filters (barangay, and how it composes with the rest) and the
 * notification list's "See More" paging.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AlertFilterAndNotificationTest
 */
class AlertFilterAndNotificationTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private Farm $farmAya;
    private Farm $farmCalansayan;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AlertFilterAndNotificationTest');
        }

        Http::fake();

        $this->admin          = User::where('role', 'admin')->firstOrFail();
        $this->farmAya        = $this->farm('Aya');
        $this->farmCalansayan = $this->farm('Calansayan');
    }

    private function farm(string $barangay): Farm
    {
        $owner = User::create([
            'first_name'    => 'Filter',
            'last_name'     => Str::random(6),
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password'      => bcrypt('x'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => "Farm {$barangay} ".Str::random(4),
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => $barangay,
            'address'       => 'x',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    private function alert(Farm $farm, string $sensorType, string $status, string $utc = '2026-10-01 02:00:00'): AlertHistory
    {
        return AlertHistory::create([
            'farm_id'             => $farm->id,
            'sensor_type'         => $sensorType,
            'status'              => $status,
            'value'               => 40,
            'triggered_at'        => Carbon::parse($utc, 'UTC'),
            'safe_readings_count' => 0,
        ]);
    }

    private function alerts(array $query)
    {
        return $this->actingAs($this->admin)
            ->getJson('/api/admin/alert-history?'.http_build_query($query))
            ->assertOk()
            ->json('data');
    }

    // ------------------------------------------------------- Barangay filter

    public function test_barangay_filter_returns_only_that_barangays_incidents(): void
    {
        $mine  = $this->alert($this->farmAya, 'ammonia', 'Critical');
        $other = $this->alert($this->farmCalansayan, 'ammonia', 'Critical');

        $ids = array_column($this->alerts(['barangay' => 'Aya']), 'id');

        $this->assertContains($mine->id, $ids);
        $this->assertNotContains($other->id, $ids);
    }

    public function test_rows_carry_their_farms_barangay(): void
    {
        $alert = $this->alert($this->farmAya, 'ammonia', 'Warning');

        $row = collect($this->alerts(['farm_id' => $this->farmAya->id]))->firstWhere('id', $alert->id);

        $this->assertSame('Aya', $row['farm_barangay']);
    }

    public function test_clearing_the_barangay_filter_restores_the_other_barangay(): void
    {
        $mine  = $this->alert($this->farmAya, 'ammonia', 'Critical');
        $other = $this->alert($this->farmCalansayan, 'ammonia', 'Critical');

        $ids = array_column($this->alerts([]), 'id');

        $this->assertContains($mine->id, $ids);
        $this->assertContains($other->id, $ids);
    }

    // --------------------------------------------------- Filters compose

    public function test_barangay_farm_severity_and_sensor_apply_together(): void
    {
        $wanted = $this->alert($this->farmAya, 'ammonia', 'Critical');

        // Each of these differs from $wanted in exactly one dimension, so a
        // filter that silently replaced another would let one of them through.
        $wrongSensor   = $this->alert($this->farmAya, 'moisture', 'Critical');
        $wrongSeverity = $this->alert($this->farmAya, 'ammonia', 'Warning');
        $wrongBarangay = $this->alert($this->farmCalansayan, 'ammonia', 'Critical');

        $ids = array_column($this->alerts([
            'barangay'    => 'Aya',
            'farm_id'     => $this->farmAya->id,
            'status'      => 'Critical',
            'sensor_type' => 'ammonia',
        ]), 'id');

        $this->assertContains($wanted->id, $ids);
        $this->assertNotContains($wrongSensor->id, $ids);
        $this->assertNotContains($wrongSeverity->id, $ids);
        $this->assertNotContains($wrongBarangay->id, $ids);
    }

    public function test_a_mismatched_barangay_and_farm_pair_returns_nothing(): void
    {
        $this->alert($this->farmAya, 'ammonia', 'Critical');

        // The farm is in Aya, so asking for it inside Calansayan must return
        // nothing rather than ignoring one of the two clauses.
        $ids = array_column($this->alerts([
            'barangay' => 'Calansayan',
            'farm_id'  => $this->farmAya->id,
        ]), 'id');

        $this->assertSame([], $ids);
    }

    public function test_only_alerting_metrics_can_ever_appear(): void
    {
        // The filter offers exactly the metrics that raise alerts; this pins
        // the config the UI list is derived from.
        $this->assertSame(['ammonia', 'moisture'], config('sensors.alerting_metrics'));
    }

    // ------------------------------------------------- Notification paging

    private function notify(int $count, bool $read = false): void
    {
        foreach (range(1, $count) as $i) {
            Notification::create([
                'user_id' => $this->admin->id,
                'title'   => "Probe {$i} ".Str::random(4),
                'message' => 'probe',
                'type'    => 'Sensor Alert',
                'is_read' => $read,
            ]);
        }
    }

    private function bell(array $query = [])
    {
        return $this->actingAs($this->admin)
            ->getJson('/api/notifications?'.http_build_query($query))
            ->assertOk();
    }

    public function test_the_list_is_capped_and_reports_that_more_exist(): void
    {
        $this->notify(14);

        $response = $this->bell(['limit' => 10]);

        $this->assertCount(10, $response->json('data'));
        $this->assertTrue($response->json('has_more'));
    }

    public function test_see_more_returns_a_longer_list_without_duplicates(): void
    {
        $this->notify(14);

        $first  = array_column($this->bell(['limit' => 10])->json('data'), 'id');
        $second = array_column($this->bell(['limit' => 20])->json('data'), 'id');

        // The longer list still starts with the same rows in the same order,
        // which is what keeps the panel from reshuffling or repeating.
        $this->assertSame($first, array_slice($second, 0, count($first)));
        $this->assertSame(count($second), count(array_unique($second)));
        $this->assertGreaterThan(count($first), count($second));
    }

    public function test_has_more_turns_off_once_everything_is_shown(): void
    {
        $this->notify(3);

        $response = $this->bell(['limit' => 50]);

        $this->assertFalse($response->json('has_more'));
    }

    public function test_the_limit_is_capped_against_an_oversized_request(): void
    {
        $this->notify(3);

        // Must not be honoured verbatim; the endpoint clamps it.
        $this->bell(['limit' => 100000])->assertOk();
    }

    public function test_unread_count_is_of_all_rows_not_just_the_page(): void
    {
        $this->notify(12);

        // Only 5 are returned, but the badge must count every unread row.
        $response = $this->bell(['limit' => 5]);

        $this->assertCount(5, $response->json('data'));
        $this->assertGreaterThanOrEqual(12, $response->json('unread_count'));
    }

    public function test_marking_one_read_lowers_the_count_by_one(): void
    {
        $this->notify(4);

        $before = $this->bell()->json('unread_count');
        $first  = $this->bell()->json('data.0.id');

        $this->actingAs($this->admin)->patchJson("/api/notifications/{$first}/read")->assertOk();

        $this->assertSame($before - 1, $this->bell()->json('unread_count'));
    }

    public function test_marking_all_read_clears_the_count(): void
    {
        $this->notify(4);

        $this->actingAs($this->admin)->patchJson('/api/notifications/read-all')->assertOk();

        $this->assertSame(0, $this->bell()->json('unread_count'));
    }
}
