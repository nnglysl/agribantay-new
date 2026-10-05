<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Support\ServiceTypes;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * "Handled By" filter (handled_by=all|mine|unassigned|others) on the Staff
 * and Vet service request lists, combined with the existing status, type
 * and search behaviour. Ownership is accepted_by compared to the caller's id.
 *
 * Same MySQL-only caveat as ServiceRequestWorkflowTest; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ServiceRequestHandledByFilterTest
 */
class ServiceRequestHandledByFilterTest extends TestCase
{
    use DatabaseTransactions;

    private User $staff1;
    private User $staff2;
    private User $vet1;
    private User $vet2;
    private User $farmer;
    private Farm $farm;

    /** Rows created per role: [mine, other, unassigned-pending, unassigned-cancelled] ids. */
    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ServiceRequestHandledByFilterTest');
        }

        Http::fake();
        $this->staff1 = $this->user('admin');
        $this->staff2 = $this->user('admin');
        $this->vet1   = $this->user('vet');
        $this->vet2   = $this->user('vet');
        $this->farmer = $this->user('farm_owner');
        $this->farm = Farm::create([
            'user_id' => $this->farmer->id, 'farm_name' => 'HandledBy Farm ' . Str::random(4), 'owner_name' => $this->farmer->full_name,
            'mobile_number' => $this->farmer->mobile_number, 'barangay' => 'Aya', 'address' => 'x',
            'farm_size' => 'Small', 'status' => 'Active',
        ]);

        // Staff side (Odor/Fly) and Vet side (Farm Biosecurity/Blood Test).
        foreach ([
            'staff' => [ServiceTypes::ODOR_CONTROL, ServiceTypes::FLY_CONTROL, $this->staff1, $this->staff2],
            'vet'   => [ServiceTypes::FARM_BIOSECURITY, ServiceTypes::BLOOD_TEST, $this->vet1, $this->vet2],
        ] as $side => [$typeA, $typeB, $me, $other]) {
            $this->ids[$side] = [
                'mine_scheduled'      => $this->request($typeA, 'Scheduled', ['accepted_by' => $me->id, 'scheduled_at' => now()->addDays(3)])->id,
                'mine_overdue'        => $this->request($typeB, 'Scheduled', ['accepted_by' => $me->id, 'scheduled_at' => now()->subDays(3)])->id,
                'mine_completed'      => $this->request($typeA, 'Completed', ['accepted_by' => $me->id, 'scheduled_at' => now()->subDay(), 'completed_at' => now()])->id,
                'other_scheduled'     => $this->request($typeA, 'Scheduled', ['accepted_by' => $other->id, 'scheduled_at' => now()->addDay()])->id,
                'other_completed'     => $this->request($typeB, 'Completed', ['accepted_by' => $other->id, 'scheduled_at' => now()->subDay(), 'completed_at' => now()])->id,
                'unassigned_pending'  => $this->request($typeA, 'Pending')->id,
                'unassigned_declined' => $this->request($typeB, 'Cancelled', ['decline_reason' => 'no stock'])->id,
            ];
        }
    }

    private function user(string $role): User
    {
        return User::create([
            'first_name' => ucfirst($role), 'last_name' => Str::random(6),
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'email' => Str::random(10) . '@handled.test',
            'password' => bcrypt('x'), 'role' => $role, 'status' => 'active',
        ]);
    }

    private function request(string $type, string $status, array $extra = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'request_number' => 'SR-H' . random_int(10000, 99999),
            'farm_id'        => $this->farm->id,
            'requested_by'   => $this->farmer->id,
            'service_type'   => $type,
            'notes'          => 'handled-by filter fixture',
            'status'         => $status,
            'priority'       => 'Medium',
        ], $extra));
    }

    /** Ids from the response that belong to this test's fixtures, as a sorted list of fixture keys. */
    private function keys(string $side, array $rows): array
    {
        $byId = array_flip($this->ids[$side]);
        $found = [];
        foreach ($rows as $row) {
            if (isset($byId[$row['id']])) $found[] = $byId[$row['id']];
        }
        sort($found);
        return $found;
    }

    private function staffList(User $as, array $params = []): array
    {
        return $this->actingAs($as)->getJson('/api/admin/service-requests?' . http_build_query($params))->assertOk()->json('data');
    }

    /** The Vet endpoint groups rows; flatten scheduled (Pending+Scheduled) + history (Completed+Cancelled). */
    private function vetList(User $as, array $params = []): array
    {
        $d = $this->actingAs($as)->getJson('/api/vet/vaccination-requests?' . http_build_query($params))->assertOk()->json('data');
        return array_merge($d['scheduled'], $d['history']);
    }

    private static function sides(): array
    {
        return ['staff', 'vet'];
    }

    // ------------------------------------------------------------------ modes

    public function test_all_and_missing_parameter_return_every_fixture(): void
    {
        foreach (self::sides() as $side) {
            $me = $side === 'staff' ? $this->staff1 : $this->vet1;
            $all = array_keys($this->ids[$side]); sort($all);
            $rows = $side === 'staff' ? $this->staffList($me) : $this->vetList($me);
            $this->assertSame($all, $this->keys($side, $rows), "$side: no parameter");
            $rows = $side === 'staff' ? $this->staffList($me, ['handled_by' => 'all']) : $this->vetList($me, ['handled_by' => 'all']);
            $this->assertSame($all, $this->keys($side, $rows), "$side: handled_by=all");
            // Unknown values are ignored, not an error.
            $rows = $side === 'staff' ? $this->staffList($me, ['handled_by' => 'bogus']) : $this->vetList($me, ['handled_by' => 'bogus']);
            $this->assertSame($all, $this->keys($side, $rows), "$side: unknown value");
        }
    }

    public function test_mine_returns_only_rows_accepted_by_the_caller(): void
    {
        foreach (self::sides() as $side) {
            $me = $side === 'staff' ? $this->staff1 : $this->vet1;
            $rows = $side === 'staff' ? $this->staffList($me, ['handled_by' => 'mine']) : $this->vetList($me, ['handled_by' => 'mine']);
            $this->assertSame(['mine_completed', 'mine_overdue', 'mine_scheduled'], $this->keys($side, $rows), $side);
            foreach ($rows as $r) $this->assertSame($me->id, $r['accepted_by_id'] ?? $me->id);

            // The other member's "mine" is the complement — by id, not name.
            $other = $side === 'staff' ? $this->staff2 : $this->vet2;
            $rows = $side === 'staff' ? $this->staffList($other, ['handled_by' => 'mine']) : $this->vetList($other, ['handled_by' => 'mine']);
            $this->assertSame(['other_completed', 'other_scheduled'], $this->keys($side, $rows), "$side (other user)");
        }
    }

    public function test_unassigned_returns_rows_with_null_handler_only(): void
    {
        foreach (self::sides() as $side) {
            $me = $side === 'staff' ? $this->staff1 : $this->vet1;
            $rows = $side === 'staff' ? $this->staffList($me, ['handled_by' => 'unassigned']) : $this->vetList($me, ['handled_by' => 'unassigned']);
            $this->assertSame(['unassigned_declined', 'unassigned_pending'], $this->keys($side, $rows), $side);
            foreach ($rows as $r) $this->assertNull($r['accepted_by']);
        }
    }

    public function test_others_returns_rows_with_a_handler_who_is_not_the_caller(): void
    {
        foreach (self::sides() as $side) {
            $me = $side === 'staff' ? $this->staff1 : $this->vet1;
            $rows = $side === 'staff' ? $this->staffList($me, ['handled_by' => 'others']) : $this->vetList($me, ['handled_by' => 'others']);
            // Pending rows with no handler are NOT "handled by others".
            $this->assertSame(['other_completed', 'other_scheduled'], $this->keys($side, $rows), $side);
        }
    }

    // ------------------------------------------------------------ combinations

    public function test_status_plus_handled_by_on_the_staff_endpoint(): void
    {
        $this->assertSame(['mine_overdue', 'mine_scheduled'], $this->keys('staff', $this->staffList($this->staff1, ['status' => 'Scheduled', 'handled_by' => 'mine'])));
        $this->assertSame(['other_completed'], $this->keys('staff', $this->staffList($this->staff1, ['status' => 'Completed', 'handled_by' => 'others'])));
        $this->assertSame(['unassigned_pending'], $this->keys('staff', $this->staffList($this->staff1, ['status' => 'Pending', 'handled_by' => 'unassigned'])));
        $this->assertSame([], $this->keys('staff', $this->staffList($this->staff1, ['status' => 'Pending', 'handled_by' => 'mine'])), 'nothing pending is mine');
    }

    public function test_status_groups_plus_handled_by_on_the_vet_endpoint(): void
    {
        // The Vet endpoint returns status buckets; the filter narrows each bucket.
        $d = $this->actingAs($this->vet1)->getJson('/api/vet/vaccination-requests?handled_by=mine')->assertOk()->json('data');
        $this->assertSame(['mine_overdue', 'mine_scheduled'], $this->keys('vet', $d['scheduled']));
        $this->assertSame(['mine_completed'], $this->keys('vet', $d['completed']));
        $d = $this->actingAs($this->vet1)->getJson('/api/vet/vaccination-requests?handled_by=unassigned')->assertOk()->json('data');
        $this->assertSame(['unassigned_pending'], $this->keys('vet', $d['scheduled']));
        $this->assertSame(['unassigned_declined'], $this->keys('vet', $d['history']));
    }

    public function test_service_type_plus_handled_by(): void
    {
        $this->assertSame(['mine_completed', 'mine_scheduled'], $this->keys('staff', $this->staffList($this->staff1, ['service_type' => ServiceTypes::ODOR_CONTROL, 'handled_by' => 'mine'])));
        $this->assertSame(['other_completed'], $this->keys('staff', $this->staffList($this->staff1, ['service_type' => ServiceTypes::FLY_CONTROL, 'handled_by' => 'others'])));
        $this->assertSame(['unassigned_declined'], $this->keys('staff', $this->staffList($this->staff1, ['service_type' => ServiceTypes::FLY_CONTROL, 'handled_by' => 'unassigned'])));

        // Vet: the type filter is client-side, but type + handled_by rows are still exposed for it.
        $rows = array_filter($this->vetList($this->vet1, ['handled_by' => 'mine']), fn ($r) => $r['service_type'] === ServiceTypes::BLOOD_TEST);
        $this->assertSame(['mine_overdue'], $this->keys('vet', array_values($rows)));
    }

    public function test_status_type_and_handled_by_together(): void
    {
        $rows = $this->staffList($this->staff1, ['status' => 'Scheduled', 'service_type' => ServiceTypes::ODOR_CONTROL, 'handled_by' => 'others', 'sort' => 'newest']);
        $this->assertSame(['other_scheduled'], $this->keys('staff', $rows));
    }

    public function test_search_fields_are_present_so_search_plus_handled_by_combines_client_side(): void
    {
        // Search is applied in the browser over these fields; the filtered
        // payload must still carry them.
        foreach ($this->staffList($this->staff1, ['handled_by' => 'mine']) as $r) {
            if (in_array($r['id'], $this->ids['staff'], true)) {
                $this->assertArrayHasKey('request_number', $r);
                $this->assertArrayHasKey('farm_name', $r);
                $this->assertArrayHasKey('farm_owner_name', $r);
            }
        }
        $mine = $this->keys('staff', array_values(array_filter($this->staffList($this->staff1, ['handled_by' => 'mine']), fn ($r) => str_contains(strtolower($r['farm_name']), 'handledby farm'))));
        $this->assertSame(['mine_completed', 'mine_overdue', 'mine_scheduled'], $mine);
    }

    // ------------------------------------------------------------ role access

    public function test_role_scoping_is_preserved_under_every_mode(): void
    {
        foreach (['all', 'mine', 'unassigned', 'others'] as $mode) {
            // Staff never sees Vet-type rows, whatever the filter says.
            foreach ($this->staffList($this->staff1, ['handled_by' => $mode]) as $r) {
                $this->assertNotContains($r['service_type'], ServiceTypes::VET, "staff/$mode leaked a vet row");
            }
            // Vet never sees Staff-type rows.
            foreach ($this->vetList($this->vet1, ['handled_by' => $mode]) as $r) {
                $this->assertContains($r['service_type'], ServiceTypes::VET, "vet/$mode leaked a staff row");
            }
            // A farmer cannot use either list at all.
            $this->actingAs($this->farmer)->getJson('/api/admin/service-requests?handled_by=' . $mode)->assertStatus(403);
            $this->actingAs($this->farmer)->getJson('/api/vet/vaccination-requests?handled_by=' . $mode)->assertStatus(403);
        }
    }

    public function test_super_admin_mine_uses_their_own_id(): void
    {
        $superAdmin = User::where('role', 'super_admin')->firstOrFail();
        $rows = $this->staffList($superAdmin, ['handled_by' => 'mine']);
        $this->assertSame([], $this->keys('staff', $rows), 'the super admin accepted none of the fixtures');
        $rows = $this->staffList($superAdmin, ['handled_by' => 'others']);
        $this->assertSame(['mine_completed', 'mine_overdue', 'mine_scheduled', 'other_completed', 'other_scheduled'], $this->keys('staff', $rows));
    }
}
