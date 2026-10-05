<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\Inspection;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Inspection Management -> Cancel Inspection.
 *
 * Cancelling used to record only the status: no reason was asked for or
 * stored, and the farm owner was never told. The reason is now required, kept
 * on the record, and repeated verbatim in the owner's notification — written
 * in the same transaction, so a cancelled inspection whose owner was never
 * notified cannot exist.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=InspectionCancellationTest
 */
class InspectionCancellationTest extends TestCase
{
    use DatabaseTransactions;

    private const REASON = 'Staff reassigned to a flooding response in another barangay.';

    private User $admin;
    private User $owner;
    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=InspectionCancellationTest');
        }

        Http::fake();

        $this->admin = User::where('role', 'admin')->firstOrFail();
        $this->owner = $this->makeOwner();
        $this->farm  = $this->makeFarm($this->owner);
    }

    private function makeOwner(): User
    {
        do {
            $mobile = '09'.random_int(100000000, 999999999);
        } while (User::where('mobile_number', $mobile)->exists());

        return User::create([
            'first_name'    => 'Owner',
            'last_name'     => Str::random(6),
            'mobile_number' => $mobile,
            'password'      => bcrypt('x'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);
    }

    private function makeFarm(User $owner): Farm
    {
        return Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => 'Cancel Test Farm '.Str::random(4),
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Aya',
            'address'       => 'x',
            'farm_size'     => 'Small',
            'status'        => 'Active',
        ]);
    }

    private function inspection(?Farm $farm = null, string $status = 'Scheduled'): Inspection
    {
        return Inspection::create([
            'inspection_number' => 'INS-C'.random_int(10000, 99999),
            'farm_id'           => ($farm ?? $this->farm)->id,
            'scheduled_by'      => $this->admin->id,
            'inspection_type'   => 'General Inspection',
            'status'            => $status,
            'scheduled_at'      => now()->addDays(4),
        ]);
    }

    private function cancel(Inspection $inspection, array $payload = ['reason' => self::REASON])
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($this->admin)
            ->patchJson("/api/admin/inspections/{$inspection->id}/cancel", $payload);
    }

    // ------------------------------------------------------ Reason required

    public function test_an_empty_reason_is_rejected_and_nothing_changes(): void
    {
        $inspection = $this->inspection();

        $this->cancel($inspection, ['reason' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');

        $fresh = $inspection->fresh();
        $this->assertSame('Scheduled', $fresh->status);
        $this->assertNull($fresh->cancellation_reason);
        $this->assertSame(0, Notification::where('user_id', $this->owner->id)->count());
    }

    public function test_a_missing_reason_field_is_rejected(): void
    {
        $inspection = $this->inspection();

        $this->cancel($inspection, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');

        $this->assertSame('Scheduled', $inspection->fresh()->status);
    }

    public function test_the_reason_is_saved_with_the_record(): void
    {
        $inspection = $this->inspection();

        $this->cancel($inspection)->assertOk()->assertJsonPath('success', true);

        $fresh = $inspection->fresh();
        $this->assertSame('Cancelled', $fresh->status);
        $this->assertSame(self::REASON, $fresh->cancellation_reason);
    }

    public function test_the_reason_comes_back_in_the_inspection_list(): void
    {
        $inspection = $this->inspection();
        $this->cancel($inspection)->assertOk();

        $this->app['auth']->forgetGuards();
        $rows = $this->actingAs($this->admin)->getJson('/api/admin/inspections')->assertOk()->json('data');

        $row = collect($rows)->firstWhere('id', $inspection->id);

        // Still present for history — not deleted.
        $this->assertNotNull($row);
        $this->assertSame('Cancelled', $row['status']);
        $this->assertSame(self::REASON, $row['cancellation_reason']);
    }

    public function test_the_scheduled_date_is_preserved(): void
    {
        $inspection = $this->inspection();
        $before = $inspection->scheduled_at->toIso8601String();

        $this->cancel($inspection)->assertOk();

        $this->assertSame($before, $inspection->fresh()->scheduled_at->toIso8601String());
    }

    public function test_cancelling_twice_is_refused(): void
    {
        $inspection = $this->inspection();

        $this->cancel($inspection)->assertOk();
        $this->cancel($inspection, ['reason' => 'A different reason entirely.'])->assertStatus(422);

        // The first reason stands; the second attempt must not overwrite it.
        $this->assertSame(self::REASON, $inspection->fresh()->cancellation_reason);
    }

    // ------------------------------------------------- Farm owner notified

    public function test_the_farm_owner_is_notified_with_the_reason(): void
    {
        $inspection = $this->inspection();

        $this->cancel($inspection)->assertOk();

        $note = Notification::where('user_id', $this->owner->id)
            ->where('type', 'Inspection Cancelled')
            ->latest('id')
            ->first();

        $this->assertNotNull($note, 'the farm owner was not notified');
        $this->assertStringContainsString(self::REASON, $note->message);
        $this->assertStringContainsString($this->farm->farm_name, $note->message);
        $this->assertFalse((bool) $note->is_read);

        // Click-through target, matching the other inspection notifications.
        $this->assertSame('/farmowner/inspections', $note->link);
    }

    public function test_an_unrelated_farm_owner_is_not_notified(): void
    {
        $otherOwner = $this->makeOwner();
        $otherFarm  = $this->makeFarm($otherOwner);
        $this->inspection($otherFarm);

        $this->cancel($this->inspection())->assertOk();

        $this->assertSame(
            0,
            Notification::where('user_id', $otherOwner->id)->count(),
            'a farm owner with no connection to this inspection was notified'
        );
    }

    public function test_no_notification_is_created_when_the_reason_is_rejected(): void
    {
        $inspection = $this->inspection();

        $this->cancel($inspection, ['reason' => '  '])->assertStatus(422);

        $this->assertSame(0, Notification::where('user_id', $this->owner->id)->count());
    }

    public function test_the_notification_carries_the_scheduled_date(): void
    {
        $inspection = $this->inspection();
        $expected = \App\Support\LocalTime::dateTime($inspection->scheduled_at);

        $this->cancel($inspection)->assertOk();

        $note = Notification::where('user_id', $this->owner->id)->latest('id')->firstOrFail();

        $this->assertStringContainsString($expected, $note->message);
    }

    // ------------------------------------------------------- Authorisation

    public function test_a_farm_owner_cannot_cancel_an_inspection(): void
    {
        $inspection = $this->inspection();

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->owner)
            ->patchJson("/api/admin/inspections/{$inspection->id}/cancel", ['reason' => self::REASON])
            ->assertStatus(403);

        $this->assertSame('Scheduled', $inspection->fresh()->status);
    }
}
