<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Inspection;
use App\Models\ManureDisposalRecord;
use App\Models\User;
use App\Support\DisposalMethods;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Farm Management -> View Farm Profile: the Inspections and Manure Disposal
 * tabs.
 *
 * Two regressions are guarded here:
 *  - the Inspections tab never sent scheduled_by, although the column, the
 *    relationship and the other inspection endpoints all had it;
 *  - the Disposal Method filter was built from the records on the current
 *    page, so a method with no row on that page vanished from the filter.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmProfileTabsTest
 */
class FarmProfileTabsTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private Farm $farm;
    private Farm $otherFarm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmProfileTabsTest');
        }

        Http::fake();

        $this->admin     = User::where('role', 'admin')->firstOrFail();
        $this->farm      = $this->makeFarm('Profile Tabs Farm');
        $this->otherFarm = $this->makeFarm('Someone Elses Farm');
    }

    private function makeFarm(string $name): Farm
    {
        $owner = User::create([
            'first_name'    => 'Owner',
            'last_name'     => Str::random(6),
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password'      => bcrypt('x'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => $name,
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Aya',
            'address'       => 'x',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    private function staff(string $first, string $last): User
    {
        return User::create([
            'first_name'    => $first,
            'last_name'     => $last,
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password'      => bcrypt('x'),
            'role'          => 'admin',
            'status'        => 'active',
        ]);
    }

    private function inspection(Farm $farm, ?User $scheduledBy, string $status = 'Scheduled'): Inspection
    {
        return Inspection::create([
            'inspection_number' => 'INS-T'.random_int(10000, 99999),
            'farm_id'           => $farm->id,
            'scheduled_by'      => $scheduledBy?->id,
            'inspection_type'   => 'General Inspection',
            'status'            => $status,
            'scheduled_at'      => now()->addDays(3),
        ]);
    }

    /**
     * $daysAgo is explicit because the endpoint orders by disposal_date desc:
     * which rows land on page 1 has to be controlled, not left to chance.
     */
    private function disposal(Farm $farm, string $method, int $daysAgo = 1): ManureDisposalRecord
    {
        return ManureDisposalRecord::create([
            'farm_id'         => $farm->id,
            'disposal_method' => $method,
            'quantity'        => 10.5,
            'disposal_date'   => now()->subDays($daysAgo)->toDateString(),
        ]);
    }

    private function inspections(array $query = [])
    {
        return $this->actingAs($this->admin)
            ->getJson("/api/admin/farms/{$this->farm->id}/inspection-records?".http_build_query($query));
    }

    private function disposals(array $query = [])
    {
        return $this->actingAs($this->admin)
            ->getJson("/api/admin/farms/{$this->farm->id}/disposal-records?".http_build_query($query));
    }

    // ------------------------------------------------------- Inspections

    public function test_inspection_shows_the_staff_member_who_scheduled_it(): void
    {
        $staff = $this->staff('Juan', 'Dela Cruz');
        $this->inspection($this->farm, $staff);

        $row = $this->inspections()->assertOk()->json('data.inspections.0');

        $this->assertSame('Juan Dela Cruz', $row['scheduled_by_name']);
        $this->assertSame($staff->id, $row['scheduled_by_id']);
    }

    public function test_each_record_shows_its_own_scheduler_not_the_caller(): void
    {
        $first  = $this->staff('Ana', 'Reyes');
        $second = $this->staff('Pedro', 'Santos');

        $this->inspection($this->farm, $first);
        $this->inspection($this->farm, $second);

        $names = collect($this->inspections(['per_page' => 50])->assertOk()->json('data.inspections'))
            ->pluck('scheduled_by_name')
            ->all();

        $this->assertContains('Ana Reyes', $names);
        $this->assertContains('Pedro Santos', $names);

        // The admin making the request must never be substituted in.
        $callerName = trim($this->admin->first_name.' '.$this->admin->last_name);
        $this->assertNotContains($callerName, $names);
    }

    public function test_inspection_without_a_scheduler_returns_null_rather_than_failing(): void
    {
        $this->inspection($this->farm, null);

        $row = $this->inspections()->assertOk()->json('data.inspections.0');

        $this->assertNull($row['scheduled_by_name']);
        $this->assertNull($row['scheduled_by_id']);
    }

    public function test_inspections_tab_only_returns_this_farms_records(): void
    {
        $staff = $this->staff('Mine', 'Only');
        $this->inspection($this->farm, $staff);
        $this->inspection($this->otherFarm, $this->staff('Other', 'Farm'));

        $rows = $this->inspections(['per_page' => 50])->assertOk()->json('data.inspections');

        $this->assertCount(1, $rows);
        $this->assertSame('Mine Only', $rows[0]['scheduled_by_name']);
    }

    // --------------------------------------------------- Manure Disposal

    public function test_filter_offers_every_valid_method_even_with_no_records(): void
    {
        $methods = $this->disposals()->assertOk()->json('data.disposal_methods');

        foreach (DisposalMethods::ALL as $expected) {
            $this->assertContains($expected, $methods);
        }
    }

    public function test_filter_is_complete_when_a_page_holds_only_one_method(): void
    {
        // Four "Sold" rows and one "Composted on-site". With per_page = 2 the
        // first page is all "Sold" — the case where the old filter offered
        // "Sold" alone.
        foreach (range(1, 4) as $daysAgo) {
            $this->disposal($this->farm, DisposalMethods::SOLD, $daysAgo);
        }

        // Oldest, so it sorts to the last page and never appears on page 1.
        $this->disposal($this->farm, DisposalMethods::COMPOSTED, 90);

        $response = $this->disposals(['per_page' => 2])->assertOk();

        $pageMethods = collect($response->json('data.records'))->pluck('disposal_method')->unique()->all();
        $this->assertSame([DisposalMethods::SOLD], array_values($pageMethods), 'page should hold only Sold rows');

        $filter = $response->json('data.disposal_methods');
        $this->assertContains(DisposalMethods::COMPOSTED, $filter);
        $this->assertContains(DisposalMethods::OTHER, $filter);
    }

    public function test_a_value_outside_the_canonical_list_is_still_offered(): void
    {
        // Written straight to the table, as a legacy row or a manual database
        // edit would be. It must stay filterable rather than disappear.
        $this->disposal($this->farm, 'Donated to neighbour');

        $methods = $this->disposals()->assertOk()->json('data.disposal_methods');

        $this->assertContains('Donated to neighbour', $methods);

        foreach (DisposalMethods::ALL as $expected) {
            $this->assertContains($expected, $methods);
        }
    }

    public function test_filter_list_does_not_leak_another_farms_custom_method(): void
    {
        $this->disposal($this->otherFarm, 'Secret Neighbour Method');
        $this->disposal($this->farm, DisposalMethods::SOLD);

        $methods = $this->disposals()->assertOk()->json('data.disposal_methods');

        $this->assertNotContains('Secret Neighbour Method', $methods);
    }

    public function test_disposal_tab_only_returns_this_farms_records(): void
    {
        $this->disposal($this->farm, DisposalMethods::SOLD);
        $this->disposal($this->otherFarm, DisposalMethods::COMPOSTED);
        $this->disposal($this->otherFarm, DisposalMethods::SOLD);

        $rows = $this->disposals(['per_page' => 50])->assertOk()->json('data.records');

        $this->assertCount(1, $rows);
        $this->assertSame(DisposalMethods::SOLD, $rows[0]['disposal_method']);
    }

    public function test_validation_accepts_exactly_the_canonical_list(): void
    {
        $this->assertSame('in:Sold,Composted on-site,Other', DisposalMethods::validationRule());
    }
}
