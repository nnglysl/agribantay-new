<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Inspection;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use App\Support\LocalTime;
use Tests\TestCase;

/**
 * Inspection scheduling with several Staff members.
 *
 * Rule under test: a farm may hold at most ONE inspection in 'Scheduled'
 * status at a time (overdue ones included); different Staff may schedule
 * different farms on the same day; every inspection records who scheduled it
 * and who is assigned to it.
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=InspectionSchedulingTest
 *
 * Runs inside a rolled-back transaction. The second Staff account created here
 * does not survive the run.
 */
class InspectionSchedulingTest extends TestCase
{
    use DatabaseTransactions;

    private User $staffOne;
    private User $staffTwo;
    private Farm $farmA;
    private Farm $farmB;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=InspectionSchedulingTest');
        }

        Http::fake();

        $this->staffOne = User::where('role', 'admin')->firstOrFail();

        // A second Staff account — the role already permits any number of them.
        $this->staffTwo = User::create([
            'first_name' => 'Second',
            'last_name' => 'Staff',
            'email' => 'staff2-'.Str::random(6).'@agribantay.test',
            'mobile_number' => '0917'.random_int(1000000, 9999999),
            'password' => bcrypt('password'),
            'role' => 'admin',
            'status' => 'active',
        ]);

        // Two farms with NO open inspection, so the tests start from a clean
        // slate.
        //
        // These are CREATED here rather than borrowed from whatever happens to
        // be in the database. Picking existing rows made the whole class fail
        // with "Undefined array key 0" the moment the database held fewer than
        // two spare Active farms — which is exactly what happened after the
        // pre-launch data cleanup. A test that depends on leftover data is not
        // testing scheduling, it is testing the seed.
        $this->farmA = $this->makeFarm('Scheduling Test Farm A');
        $this->farmB = $this->makeFarm('Scheduling Test Farm B');
    }

    private function makeFarm(string $name): Farm
    {
        $owner = User::create([
            'first_name'    => 'Sched',
            'last_name'     => Str::random(6),
            'email'         => Str::lower(Str::random(10)) . '@agribantay.test',
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password'      => bcrypt('password'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => $name,
            'owner_name'    => 'Sched Owner',
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Calansayan',
            'municipality'  => 'San Jose',
            'province'      => 'Batangas',
            'address'       => 'Calansayan, San Jose, Batangas',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    private function schedule(User $as, Farm $farm, string $at = '2027-03-10 09:00:00', array $extra = [])
    {
        return $this->actingAs($as)->postJson('/api/admin/inspections', array_merge([
            'farm_id' => $farm->id,
            'inspection_type' => 'General Inspection',
            'scheduled_at' => $at,
        ], $extra));
    }

    /** Two Staff, two farms, one day — both succeed. The old rule refused the second. */
    public function test_different_staff_can_schedule_different_farms_on_the_same_day(): void
    {
        $this->schedule($this->staffOne, $this->farmA, '2027-03-10 09:00:00')->assertOk();
        $this->schedule($this->staffTwo, $this->farmB, '2027-03-10 14:00:00')->assertOk();

        $this->assertSame(2, Inspection::whereDate('scheduled_at', '2027-03-10')->where('status', 'Scheduled')->count());
    }

    /**
     * One Staff member, one farm per day — a biosecurity limit.
     *
     * Someone who walks through one poultry house and then another the same
     * day carries whatever the first flock has into the second. This test
     * previously asserted the opposite: the per-day limit had been dropped
     * entirely when the old system-wide version was retired, instead of being
     * narrowed to one person.
     */
    public function test_one_staff_cannot_schedule_two_farms_on_the_same_day(): void
    {
        $this->schedule($this->staffOne, $this->farmA, '2027-03-11 09:00:00')->assertOk();
        $this->schedule($this->staffOne, $this->farmB, '2027-03-11 11:00:00')->assertStatus(409);

        $this->assertSame(1, Inspection::whereDate('scheduled_at', '2027-03-11')->count());
    }

    /** A completed visit still occupies the day — the exposure already happened. */
    public function test_a_completed_visit_blocks_a_second_farm_the_same_day(): void
    {
        $id = $this->schedule($this->staffOne, $this->farmA, '2027-03-16 09:00:00')->assertOk()->json('data.id');
        $this->actingAs($this->staffOne)
            ->patchJson("/api/admin/inspections/{$id}/complete", ['findings' => 'All clear.'])
            ->assertOk();

        $this->schedule($this->staffOne, $this->farmB, '2027-03-16 14:00:00')->assertStatus(409);
    }

    /** Rescheduling cannot be used to get around the daily limit. */
    public function test_reschedule_cannot_land_on_a_day_the_staff_is_already_booked(): void
    {
        $this->schedule($this->staffOne, $this->farmA, '2027-03-17 09:00:00')->assertOk();
        $id = $this->schedule($this->staffOne, $this->farmB, '2027-03-18 09:00:00')->assertOk()->json('data.id');

        $this->actingAs($this->staffOne)
            ->patchJson("/api/admin/inspections/{$id}/reschedule", [
                'scheduled_at' => '2027-03-17 14:00:00',
                'reason'       => 'Owner asked to move it.',
            ])
            ->assertStatus(409);
    }

    /** A farm with an active inspection is refused a second one — by either Staff member. */
    public function test_a_farm_with_an_active_inspection_cannot_be_scheduled_again(): void
    {
        $first = $this->schedule($this->staffOne, $this->farmA, '2027-03-12 09:00:00')->assertOk();
        $activeId = $first->json('data.id');

        // Same Staff, different day.
        $this->schedule($this->staffOne, $this->farmA, '2027-03-20 09:00:00')
            ->assertStatus(409)
            ->assertJsonPath('success', false)
            ->assertJsonPath('data.active_inspection_id', $activeId);

        // Different Staff, different day.
        $this->schedule($this->staffTwo, $this->farmA, '2027-03-25 09:00:00')
            ->assertStatus(409);

        $this->assertSame(1, Inspection::where('farm_id', $this->farmA->id)->where('status', 'Scheduled')->count());
    }

    /** An overdue inspection is still active and still blocks. */
    public function test_an_overdue_inspection_still_blocks_the_farm(): void
    {
        Inspection::create([
            'inspection_number' => 'INS-TEST-OVERDUE',
            'farm_id' => $this->farmA->id,
            'scheduled_by' => $this->staffOne->id,
            'assigned_to' => $this->staffOne->id,
            'inspection_type' => 'General Inspection',
            'status' => 'Scheduled',
            'scheduled_at' => now()->subDays(10),
        ]);

        $this->schedule($this->staffTwo, $this->farmA)->assertStatus(409);
    }

    /** Completing or cancelling frees the farm for a new schedule. */
    public function test_completed_or_cancelled_inspection_frees_the_farm(): void
    {
        $id = $this->schedule($this->staffOne, $this->farmA, '2027-03-13 09:00:00')->assertOk()->json('data.id');
        $this->schedule($this->staffOne, $this->farmA, '2027-04-01 09:00:00')->assertStatus(409);

        $this->actingAs($this->staffOne)->patchJson("/api/admin/inspections/{$id}/complete", ['findings' => 'All clear.'])->assertOk();
        $this->schedule($this->staffTwo, $this->farmA, '2027-04-01 09:00:00')->assertOk();

        // A different DAY from the 03-13 visit above, so the one-farm-per-staff-
        // per-day rule does not decide this test — what it is about is a
        // cancelled inspection freeing the FARM.
        $id2 = $this->schedule($this->staffOne, $this->farmB, '2027-03-14 10:00:00')->assertOk()->json('data.id');
        // Cancelling now requires a reason (InspectionCancellationTest covers
        // the rule itself); what this test cares about is that a cancelled
        // inspection frees the farm for a new one.
        $this->actingAs($this->staffOne)
            ->patchJson("/api/admin/inspections/{$id2}/cancel", ['reason' => 'Farm owner requested a different week.'])
            ->assertOk();
        $this->schedule($this->staffOne, $this->farmB, '2027-04-02 09:00:00')->assertOk();
    }

    /** The scheduling Staff member is recorded and is the responsible member. */
    public function test_scheduler_is_recorded_and_is_the_responsible_staff(): void
    {
        $id = $this->schedule($this->staffTwo, $this->farmA)->assertOk()->json('data.id');
        $i = Inspection::findOrFail($id);

        $this->assertSame($this->staffTwo->id, $i->scheduled_by);
        $this->assertSame($i->scheduled_by, $i->assigned_to, 'assigned_to must mirror scheduled_by');
    }

    /** There is no separate assignment: a submitted assigned_to is ignored. */
    public function test_a_submitted_assignee_is_ignored(): void
    {
        $id = $this->schedule($this->staffOne, $this->farmA, '2027-03-14 09:00:00', ['assigned_to' => $this->staffTwo->id])
            ->assertOk()->json('data.id');
        $i = Inspection::findOrFail($id);

        $this->assertSame($this->staffOne->id, $i->scheduled_by);
        $this->assertSame($this->staffOne->id, $i->assigned_to, 'another Staff member cannot be assigned');
    }

    /**
     * The modal submits a Philippine wall-clock time with no timezone. It must
     * come back out as the same wall-clock time — previously "09:00" was stored
     * as 09:00Z and rendered as 5:00 PM.
     */
    public function test_scheduled_time_round_trips_in_local_time(): void
    {
        $id = $this->schedule($this->staffOne, $this->farmA, '2027-03-10 09:00:00')->assertOk()->json('data.id');
        $i = Inspection::findOrFail($id);

        $this->assertSame('2027-03-10 01:00:00', $i->scheduled_at->toDateTimeString(), 'stored as the UTC instant');
        $this->assertSame('Mar 10, 2027 9:00 AM', LocalTime::dateTime($i->scheduled_at), 'displayed as what was entered');

        // Reschedule keeps the same handling.
        $this->actingAs($this->staffOne)
            ->patchJson("/api/admin/inspections/{$id}/reschedule", ['scheduled_at' => '2027-03-12 14:30:00', 'reason' => 'Owner request'])
            ->assertOk();
        $this->assertSame('Mar 12, 2027 2:30 PM', LocalTime::dateTime(Inspection::findOrFail($id)->scheduled_at));
    }

    /** The list exposes both names and the owner, so the UI can show them. */
    public function test_list_exposes_owner_assignee_and_scheduler(): void
    {
        $id = $this->schedule($this->staffTwo, $this->farmA, '2027-03-15 09:00:00')->assertOk()->json('data.id');

        $row = collect($this->actingAs($this->staffOne)->getJson('/api/admin/inspections')->assertOk()->json('data'))
            ->firstWhere('id', $id);

        $this->assertNotNull($row);
        $this->assertSame($this->farmA->id, $row['farm_id']);
        $this->assertSame($this->farmA->owner_name, $row['owner_name']);
        $this->assertSame('Second Staff', $row['scheduled_by_name']);
        $this->assertSame($this->staffTwo->id, $row['scheduled_by_id']);
        $this->assertSame($row['scheduled_by_id'], $row['assigned_to_id'], 'assignee mirrors scheduler in the API too');
    }

    /** Numbers no longer come from count()+1, so consecutive creates never collide. */
    public function test_inspection_numbers_are_unique_and_id_based(): void
    {
        $a = Inspection::findOrFail($this->schedule($this->staffOne, $this->farmA, '2027-03-16 09:00:00')->assertOk()->json('data.id'));
        $b = Inspection::findOrFail($this->schedule($this->staffTwo, $this->farmB, '2027-03-16 10:00:00')->assertOk()->json('data.id'));

        $this->assertNotSame($a->inspection_number, $b->inspection_number);
        $this->assertMatchesRegularExpression('/^INS-\d{3,}$/', $a->inspection_number);
        $this->assertSame('INS-'.str_pad($a->id, 3, '0', STR_PAD_LEFT), $a->inspection_number);
        $this->assertSame(0, Inspection::where('inspection_number', 'like', 'TMP-%')->count(), 'no placeholder number may survive');
    }

    /** Rescheduling is no longer blocked by another farm's inspection on the target day. */
    public function test_reschedule_is_not_blocked_by_other_farms_on_the_same_day(): void
    {
        $id = $this->schedule($this->staffOne, $this->farmA, '2027-03-17 09:00:00')->assertOk()->json('data.id');
        $this->schedule($this->staffTwo, $this->farmB, '2027-03-18 09:00:00')->assertOk();

        // Move A onto B's day — allowed now.
        $this->actingAs($this->staffOne)
            ->patchJson("/api/admin/inspections/{$id}/reschedule", ['scheduled_at' => '2027-03-18 14:00:00', 'reason' => 'Owner request'])
            ->assertOk();

        // Stored as the UTC instant; shown as the wall-clock time that was entered.
        $moved = Inspection::findOrFail($id)->scheduled_at;
        $this->assertSame('2027-03-18 06:00:00', $moved->toDateTimeString());
        $this->assertSame('Mar 18, 2027 2:00 PM', LocalTime::dateTime($moved));
    }

    /** Only a Scheduled inspection can be rescheduled. */
    public function test_reschedule_refuses_a_completed_inspection(): void
    {
        $id = $this->schedule($this->staffOne, $this->farmA, '2027-03-19 09:00:00')->assertOk()->json('data.id');
        $this->actingAs($this->staffOne)->patchJson("/api/admin/inspections/{$id}/complete", ['findings' => 'Done'])->assertOk();

        $this->actingAs($this->staffOne)
            ->patchJson("/api/admin/inspections/{$id}/reschedule", ['scheduled_at' => '2027-04-05 09:00:00', 'reason' => 'x'])
            ->assertStatus(422);
    }

    /** The pre-existing past-date rule is preserved. */
    public function test_past_dates_are_still_refused(): void
    {
        $this->schedule($this->staffOne, $this->farmA, now()->subDay()->format('Y-m-d H:i:s'))->assertStatus(422);
    }
}
