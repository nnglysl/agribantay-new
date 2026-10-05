<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Support\LocalTime;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Shared visibility, first-come ownership, and Philippine-time handling for
 * service requests — Staff (Odor/Fly) and Veterinarian (Vaccine/Blood Test).
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ServiceRequestOwnershipTest
 *
 * Runs inside a rolled-back transaction; the second Staff and Vet accounts
 * created here do not survive the run.
 */
class ServiceRequestOwnershipTest extends TestCase
{
    use DatabaseTransactions;

    private User $staff1;
    private User $staff2;
    private User $vet1;
    private User $vet2;
    private User $superAdmin;
    private User $farmer;
    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ServiceRequestOwnershipTest');
        }

        Http::fake();

        $this->staff1 = User::where('role', 'admin')->firstOrFail();
        $this->vet1 = User::where('role', 'vet')->firstOrFail();
        $this->superAdmin = User::where('role', 'super_admin')->firstOrFail();
        $this->staff2 = $this->makeUser('admin', 'Second', 'Staff');
        $this->vet2 = $this->makeUser('vet', 'Second', 'Vet');

        $this->farmer = $this->makeUser('farm_owner', 'Test', 'Farmer');
        $this->farm = Farm::create([
            'user_id' => $this->farmer->id, 'farm_name' => 'Ownership Test Farm', 'owner_name' => 'Test Farmer',
            'mobile_number' => $this->farmer->mobile_number, 'barangay' => 'Aya', 'address' => 'x',
            'farm_size' => 'Small', 'status' => 'Active',
        ]);
    }

    private function makeUser(string $role, string $first, string $last): User
    {
        return User::create([
            'first_name' => $first, 'last_name' => $last,
            'email' => Str::lower($first.$last).'-'.Str::random(6).'@agribantay.test',
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password' => bcrypt('x'), 'role' => $role, 'status' => 'active',
        ]);
    }

    private function request(string $type, string $status = 'Pending', array $extra = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'request_number' => 'SR-O'.random_int(10000, 99999),
            'farm_id' => $this->farm->id,
            'requested_by' => $this->farmer->id,
            'service_type' => $type,
            'status' => $status,
            'priority' => 'Medium',
        ], $extra));
    }

    /** [base, member A, member B, service type] for each role. */
    private function roles(): array
    {
        return [
            'staff' => ['/api/admin/service-requests', $this->staff1, $this->staff2, 'Odor Control Request'],
            'vet' => ['/api/vet/vaccination-requests', $this->vet1, $this->vet2, 'Vaccine Request'],
        ];
    }

    // ------------------------------------------------------------ ownership

    public function test_accepting_records_the_acceptor_as_the_responsible_member(): void
    {
        foreach ($this->roles() as $role => [$base, $a, $b, $type]) {
            $sr = $this->request($type);
            $this->actingAs($a)->patchJson("$base/{$sr->id}/accept", ['scheduled_at' => '2027-04-10 09:00:00'])->assertOk();

            $sr->refresh();
            $this->assertSame('Scheduled', $sr->status, $role);
            $this->assertSame($a->id, $sr->accepted_by, "$role: acceptor recorded");
        }
    }

    public function test_a_request_already_accepted_by_someone_else_cannot_be_accepted_again(): void
    {
        foreach ($this->roles() as $role => [$base, $a, $b, $type]) {
            $sr = $this->request($type);
            $this->actingAs($a)->patchJson("$base/{$sr->id}/accept", ['scheduled_at' => '2027-04-10 09:00:00'])->assertOk();

            $this->actingAs($b)->patchJson("$base/{$sr->id}/accept", ['scheduled_at' => '2027-04-11 09:00:00'])
                ->assertStatus(409)
                ->assertJsonPath('success', false);

            $sr->refresh();
            $this->assertSame($a->id, $sr->accepted_by, "$role: ownership must not be stolen");
            $this->assertSame('2027-04-10 01:00:00', $sr->scheduled_at->toDateTimeString(), "$role: schedule must not be overwritten");
        }
    }

    public function test_only_a_pending_request_can_be_accepted(): void
    {
        foreach ($this->roles() as $role => [$base, $a, $b, $type]) {
            foreach (['Cancelled', 'Completed'] as $status) {
                $sr = $this->request($type, $status, ['accepted_by' => $a->id]);
                $this->actingAs($b)->patchJson("$base/{$sr->id}/accept", ['scheduled_at' => '2027-04-10 09:00:00'])->assertStatus(409);
                $this->assertSame($status, $sr->fresh()->status, "$role/$status");
            }
        }
    }

    public function test_only_the_responsible_member_can_complete(): void
    {
        foreach ($this->roles() as $role => [$base, $a, $b, $type]) {
            $sr = $this->request($type, 'Scheduled', ['accepted_by' => $a->id, 'scheduled_at' => now()->subDay()]);

            $this->actingAs($b)->patchJson("$base/{$sr->id}/complete", ['completion_notes' => 'Done'])
                ->assertStatus(403)
                ->assertJsonPath('success', false);
            $this->assertSame('Scheduled', $sr->fresh()->status, "$role: another member must not complete it");

            $this->actingAs($a)->patchJson("$base/{$sr->id}/complete", ['completion_notes' => 'Done'])->assertOk();
            $this->assertSame('Completed', $sr->fresh()->status, "$role: the owner can complete it");
        }
    }

    public function test_only_the_responsible_member_can_reschedule_or_undo(): void
    {
        foreach ($this->roles() as $role => [$base, $a, $b, $type]) {
            $sr = $this->request($type, 'Scheduled', ['accepted_by' => $a->id, 'scheduled_at' => now()->addDay()]);

            $this->actingAs($b)->patchJson("$base/{$sr->id}/reschedule", ['scheduled_at' => '2027-04-12 09:00:00', 'reason' => 'x'])->assertStatus(403);
            $this->actingAs($a)->patchJson("$base/{$sr->id}/reschedule", ['scheduled_at' => '2027-04-12 09:00:00', 'reason' => 'x'])->assertOk();

            $done = $this->request($type, 'Completed', ['accepted_by' => $a->id, 'scheduled_at' => now()->subDay(), 'completed_at' => now()]);
            $this->actingAs($b)->patchJson("$base/{$done->id}/reopen")->assertStatus(403);
            $this->assertSame('Completed', $done->fresh()->status, "$role: another member must not undo it");
        }
    }

    public function test_declining_is_only_possible_while_pending(): void
    {
        foreach ($this->roles() as $role => [$base, $a, $b, $type]) {
            $sr = $this->request($type, 'Scheduled', ['accepted_by' => $a->id, 'scheduled_at' => now()->addDay()]);
            $this->actingAs($b)->patchJson("$base/{$sr->id}/decline", ['decline_reason' => 'Taking over'])->assertStatus(422);
            $this->assertSame('Scheduled', $sr->fresh()->status, "$role: an accepted visit cannot be declined away");
        }
    }

    public function test_staff_cancel_of_an_accepted_visit_is_owner_only(): void
    {
        $sr = $this->request('Odor Control Request', 'Scheduled', ['accepted_by' => $this->staff1->id, 'scheduled_at' => now()->addDay()]);
        $this->actingAs($this->staff2)->patchJson("/api/admin/service-requests/{$sr->id}/cancel")->assertStatus(403);
        $this->actingAs($this->staff1)->patchJson("/api/admin/service-requests/{$sr->id}/cancel")->assertOk();
        $this->assertSame('Cancelled', $sr->fresh()->status);
    }

    /** Documented override: Super Admin may act on anyone's request via the API. */
    public function test_super_admin_override_can_complete_another_members_request(): void
    {
        foreach ($this->roles() as $role => [$base, $a, $b, $type]) {
            $sr = $this->request($type, 'Scheduled', ['accepted_by' => $a->id, 'scheduled_at' => now()->subDay()]);
            $this->actingAs($this->superAdmin)->patchJson("$base/{$sr->id}/complete", ['completion_notes' => 'Override'])->assertOk();
            $this->assertSame('Completed', $sr->fresh()->status, $role);
        }
    }

    // ----------------------------------------------------------- visibility

    public function test_every_member_sees_the_shared_list_including_colleagues_accepted_requests(): void
    {
        // Staff
        $mine = $this->request('Odor Control Request', 'Scheduled', ['accepted_by' => $this->staff1->id, 'scheduled_at' => now()->addDay()]);
        $rows = collect($this->actingAs($this->staff2)->getJson('/api/admin/service-requests')->assertOk()->json('data'));
        $row = $rows->firstWhere('id', $mine->id);
        $this->assertNotNull($row, 'Staff 2 must see Staff 1\'s accepted request');
        $this->assertSame($this->staff1->id, $row['accepted_by_id']);
        $this->assertStringContainsString($this->staff1->first_name, $row['accepted_by']);

        // Vet — previously filtered to "mine or unassigned", which hid this.
        $vetMine = $this->request('Vaccine Request', 'Scheduled', ['accepted_by' => $this->vet1->id, 'scheduled_at' => now()->addDay()]);
        $data = $this->actingAs($this->vet2)->getJson('/api/vet/vaccination-requests')->assertOk()->json('data');
        $vrow = collect($data['scheduled'])->firstWhere('id', $vetMine->id);
        $this->assertNotNull($vrow, 'Vet 2 must see Vet 1\'s accepted request');
        $this->assertSame($this->vet1->id, $vrow['accepted_by_id']);
    }

    public function test_staff_cannot_reach_vet_endpoints(): void
    {
        $sr = $this->request('Vaccine Request');
        $this->actingAs($this->staff1)->patchJson("/api/vet/vaccination-requests/{$sr->id}/accept", ['scheduled_at' => '2027-04-10 09:00:00'])
            ->assertStatus(403);
        $this->assertSame('Pending', $sr->fresh()->status);
    }

    // ------------------------------------------------------------- timezone

    /** 9:00 AM entered must be 9:00 AM shown — not 5:00 PM — for accept and reschedule. */
    public function test_scheduled_times_round_trip_in_philippine_time(): void
    {
        foreach ($this->roles() as $role => [$base, $a, $b, $type]) {
            foreach ([['09:00', '01:00:00', '9:00 AM'], ['17:00', '09:00:00', '5:00 PM']] as [$entered, $utc, $shown]) {
                $sr = $this->request($type);
                $this->actingAs($a)->patchJson("$base/{$sr->id}/accept", ['scheduled_at' => "2027-04-10 {$entered}:00"])->assertOk();
                $sr->refresh();
                $this->assertSame("2027-04-10 {$utc}", $sr->scheduled_at->toDateTimeString(), "$role accept $entered: stored as UTC instant");
                $this->assertSame("Apr 10, 2027 {$shown}", LocalTime::dateTime($sr->scheduled_at), "$role accept $entered: shown as entered");

                $this->actingAs($a)->patchJson("$base/{$sr->id}/reschedule", ['scheduled_at' => "2027-04-15 {$entered}:00", 'reason' => 'Moved'])->assertOk();
                $sr->refresh();
                $this->assertSame("2027-04-15 {$utc}", $sr->scheduled_at->toDateTimeString(), "$role reschedule $entered: stored as UTC instant");
                $this->assertSame("Apr 15, 2027 {$shown}", LocalTime::dateTime($sr->scheduled_at), "$role reschedule $entered: shown as entered");
                $this->assertSame("2027-04-10 {$utc}", $sr->previous_scheduled_at->toDateTimeString(), "$role: previous schedule kept");
            }
        }
    }

    /** The API returns an ISO instant the browser converts once — no double shift. */
    public function test_api_returns_the_utc_instant_not_a_pre_shifted_value(): void
    {
        $sr = $this->request('Odor Control Request');
        $this->actingAs($this->staff1)->patchJson("/api/admin/service-requests/{$sr->id}/accept", ['scheduled_at' => '2027-04-10 09:00:00'])->assertOk();

        $row = collect($this->actingAs($this->staff1)->getJson('/api/admin/service-requests')->json('data'))->firstWhere('id', $sr->id);
        // Serialised in UTC with a Z; the frontend's formatDateTime pins Asia/Manila and yields 9:00 AM.
        $this->assertStringStartsWith('2027-04-10T01:00:00', $row['scheduled_at']);
    }
}
