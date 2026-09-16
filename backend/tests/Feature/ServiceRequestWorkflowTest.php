<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\Notification;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Service request workflow — Pending → Accept/Decline → Scheduled →
 * Completed → Reopen, for both the Admin (Odor/Fly) and Vet (Vaccine/Blood
 * Test) endpoints, plus the status guards and the Reopen duplicate guard.
 *
 * Same MySQL-only caveat as DeviceRotationTest; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ServiceRequestWorkflowTest
 */
class ServiceRequestWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private User $vet;
    private User $farmer;
    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ServiceRequestWorkflowTest');
        }

        Http::fake();
        $this->admin = User::where('role', 'admin')->firstOrFail();
        $this->vet   = User::where('role', 'vet')->firstOrFail();

        $this->farmer = User::create([
            'first_name' => 'Test', 'last_name' => Str::random(6),
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password' => bcrypt('x'), 'role' => 'farm_owner', 'status' => 'active',
        ]);
        $this->farm = Farm::create([
            'user_id' => $this->farmer->id, 'farm_name' => 'SR Test Farm', 'owner_name' => $this->farmer->full_name,
            'mobile_number' => $this->farmer->mobile_number, 'barangay' => 'Aya', 'address' => 'x',
            'farm_size' => 'Small', 'status' => 'Active',
        ]);
    }

    private function request(string $type, string $status = 'Pending', array $extra = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'request_number' => 'SR-T' . random_int(10000, 99999),
            'farm_id'        => $this->farm->id,
            'requested_by'   => $this->farmer->id,
            'service_type'   => $type,
            'notes'          => 'Original farmer notes',
            'status'         => $status,
            'priority'       => 'Medium',
        ], $extra));
    }

    /** [endpoint prefix, actor, service type] for each role. */
    private static function roles(): array
    {
        return [
            'admin' => ['/api/admin/service-requests', 'Odor Control Request'],
            'vet'   => ['/api/vet/vaccination-requests', 'Vaccine Request'],
        ];
    }

    private function actor(string $role): User
    {
        return $role === 'vet' ? $this->vet : $this->admin;
    }

    // ---------------------------------------------------------------- Pending

    public function test_accept_requires_schedule_and_moves_to_scheduled(): void
    {
        foreach (self::roles() as $role => [$base, $type]) {
            $sr = $this->request($type);
            $this->actingAs($this->actor($role))->patchJson("$base/{$sr->id}/accept", [])->assertStatus(422);
            $this->actingAs($this->actor($role))->patchJson("$base/{$sr->id}/accept", ['scheduled_at' => now()->addDays(3)->toDateTimeString()])->assertStatus(200);
            $sr->refresh();
            $this->assertSame('Scheduled', $sr->status, $role);
            $this->assertSame($this->actor($role)->id, $sr->accepted_by, $role);
        }
    }

    public function test_decline_requires_reason_and_moves_to_cancelled(): void
    {
        foreach (self::roles() as $role => [$base, $type]) {
            $sr = $this->request($type);
            $this->actingAs($this->actor($role))->patchJson("$base/{$sr->id}/decline", [])->assertStatus(422);
            $this->actingAs($this->actor($role))->patchJson("$base/{$sr->id}/decline", ['decline_reason' => 'Not available'])->assertStatus(200);
            $sr->refresh();
            $this->assertSame('Cancelled', $sr->status, $role);
            $this->assertSame('Not available', $sr->decline_reason, $role);
        }
    }

    // ---------------------------------------------------------- Complete guard

    public function test_complete_only_allowed_from_scheduled(): void
    {
        foreach (self::roles() as $role => [$base, $type]) {
            foreach (['Pending', 'Cancelled', 'Completed'] as $status) {
                $sr = $this->request($type, $status, ['scheduled_at' => now()->subDay()]);
                $this->actingAs($this->actor($role))
                    ->patchJson("$base/{$sr->id}/complete", ['completion_notes' => 'x'])
                    ->assertStatus(422)
                    ->assertJsonPath('message', 'Only a scheduled request can be marked as completed.');
                $this->assertSame($status, $sr->fresh()->status, "$role/$status");
            }
        }
    }

    public function test_complete_stores_completion_notes_separately(): void
    {
        // Admin: notes optional.
        $sr = $this->request('Odor Control Request', 'Scheduled', ['scheduled_at' => now()->subDay(), 'accepted_by' => $this->admin->id]);
        $this->actingAs($this->admin)->patchJson("/api/admin/service-requests/{$sr->id}/complete", [])->assertStatus(200);
        $sr->refresh();
        $this->assertSame('Completed', $sr->status);
        $this->assertNotNull($sr->completed_at);
        $this->assertNull($sr->completion_notes);
        $this->assertSame('Original farmer notes', $sr->notes);

        $sr2 = $this->request('Fly Control Request', 'Scheduled', ['scheduled_at' => now()->subDay(), 'accepted_by' => $this->admin->id]);
        $this->actingAs($this->admin)->patchJson("/api/admin/service-requests/{$sr2->id}/complete", ['completion_notes' => 'Sprayed the coop'])->assertStatus(200);
        $sr2->refresh();
        $this->assertSame('Sprayed the coop', $sr2->completion_notes);
        $this->assertSame('Original farmer notes', $sr2->notes);

        // Vet: notes required.
        $sr3 = $this->request('Vaccine Request', 'Scheduled', ['scheduled_at' => now()->subDay(), 'accepted_by' => $this->vet->id]);
        $this->actingAs($this->vet)->patchJson("/api/vet/vaccination-requests/{$sr3->id}/complete", [])->assertStatus(422);
        $this->actingAs($this->vet)->patchJson("/api/vet/vaccination-requests/{$sr3->id}/complete", ['completion_notes' => 'Administered NDV'])->assertStatus(200);
        $sr3->refresh();
        $this->assertSame('Administered NDV', $sr3->completion_notes);
        $this->assertSame('Original farmer notes', $sr3->notes);
    }

    // ------------------------------------------------------------------ Reopen

    public function test_reopen_returns_to_scheduled_keeping_schedule_and_acceptor(): void
    {
        foreach (self::roles() as $role => [$base, $type]) {
            $actor = $this->actor($role);
            $scheduledAt = now()->subDays(2)->setTime(9, 0);
            $sr = $this->request($type, 'Completed', [
                'scheduled_at' => $scheduledAt, 'completed_at' => now(), 'accepted_by' => $actor->id,
                'previous_scheduled_at' => now()->subDays(5), 'reschedule_reason' => 'rain', 'completion_notes' => 'done',
            ]);

            $logsBefore = ActivityLog::count();
            $notesBefore = Notification::where('user_id', $this->farmer->id)->count();

            $this->actingAs($actor)->patchJson("$base/{$sr->id}/reopen")->assertStatus(200);
            $sr->refresh();

            $this->assertSame('Scheduled', $sr->status, $role);
            $this->assertNull($sr->completed_at, $role);
            $this->assertEquals($scheduledAt->toDateTimeString(), $sr->scheduled_at->toDateTimeString(), $role);
            $this->assertSame($actor->id, $sr->accepted_by, $role);
            $this->assertNotNull($sr->previous_scheduled_at, $role);
            $this->assertSame('rain', $sr->reschedule_reason, $role);
            $this->assertSame('Original farmer notes', $sr->notes, $role);
            $this->assertSame($logsBefore + 1, ActivityLog::count(), $role);
            $this->assertSame($notesBefore + 1, Notification::where('user_id', $this->farmer->id)->count(), $role);
        }
    }

    public function test_reopen_only_allowed_from_completed(): void
    {
        foreach (self::roles() as $role => [$base, $type]) {
            foreach (['Pending', 'Scheduled', 'Cancelled'] as $status) {
                $sr = $this->request($type, $status, ['scheduled_at' => now()->addDay()]);
                $this->actingAs($this->actor($role))->patchJson("$base/{$sr->id}/reopen")
                    ->assertStatus(422)
                    ->assertJsonPath('message', 'Only a completed request can have its completion undone.');
                $this->assertSame($status, $sr->fresh()->status, "$role/$status");
            }
        }
    }

    public function test_reopen_blocked_when_another_active_request_of_same_service_exists(): void
    {
        foreach (self::roles() as $role => [$base, $type]) {
            foreach (['Pending', 'Scheduled'] as $otherStatus) {
                $done  = $this->request($type, 'Completed', ['scheduled_at' => now()->subDays(3), 'completed_at' => now()->subDays(2)]);
                $other = $this->request($type, $otherStatus, ['scheduled_at' => now()->addDays(2)]);

                $this->actingAs($this->actor($role))->patchJson("$base/{$done->id}/reopen")
                    ->assertStatus(422)
                    ->assertJsonPath('message', 'The completion cannot be undone because another active request for the same service already exists.');

                $this->assertSame('Completed', $done->fresh()->status, "$role/$otherStatus");
                $this->assertNotNull($done->fresh()->completed_at);

                $other->delete();
                $done->delete();
            }

            // A different service type must NOT block it.
            $done  = $this->request($type, 'Completed', ['scheduled_at' => now()->subDays(3), 'completed_at' => now()]);
            $otherType = $role === 'vet' ? 'Blood Test Request' : 'Fly Control Request';
            $this->request($otherType, 'Pending');
            $this->actingAs($this->actor($role))->patchJson("$base/{$done->id}/reopen")->assertStatus(200);
        }
    }

    // ------------------------------------------------ Farmer duplicate rule

    public function test_farmer_duplicate_rule_unchanged(): void
    {
        $this->request('Odor Control Request', 'Scheduled', ['scheduled_at' => now()->addDay()]);
        $this->actingAs($this->farmer)
            ->postJson('/api/farmer/service-requests', ['service_type' => 'Odor Control Request', 'farm_id' => $this->farm->id])
            ->assertStatus(422);

        ServiceRequest::where('farm_id', $this->farm->id)->update(['status' => 'Completed', 'completed_at' => now()]);
        $this->actingAs($this->farmer)
            ->postJson('/api/farmer/service-requests', ['service_type' => 'Odor Control Request', 'farm_id' => $this->farm->id])
            ->assertStatus(200);
    }

    // -------------------------------------------------- Vet list includes History

    public function test_vet_index_exposes_history_with_cancelled_and_completion_notes(): void
    {
        $this->request('Vaccine Request', 'Cancelled', ['decline_reason' => 'No stock']);
        $this->request('Vaccine Request', 'Completed', ['scheduled_at' => now()->subDay(), 'completed_at' => now(), 'accepted_by' => $this->vet->id, 'completion_notes' => 'ok']);

        $res = $this->actingAs($this->vet)->getJson('/api/vet/vaccination-requests')->assertStatus(200);
        $history = collect($res->json('data.history'));
        $this->assertTrue($history->contains(fn ($r) => $r['status'] === 'Cancelled' && $r['decline_reason'] === 'No stock'));
        $this->assertTrue($history->contains(fn ($r) => $r['status'] === 'Completed' && $r['completion_notes'] === 'ok'));
        $this->assertFalse(collect($res->json('data.completed'))->contains(fn ($r) => $r['status'] === 'Cancelled'));
    }

    public function test_admin_index_exposes_cancelled_and_completion_notes(): void
    {
        $this->request('Odor Control Request', 'Cancelled', ['decline_reason' => 'No stock']);
        $res = $this->actingAs($this->admin)->getJson('/api/admin/service-requests')->assertStatus(200);
        $row = collect($res->json('data'))->firstWhere('farm_name', 'SR Test Farm');
        $this->assertSame('Cancelled', $row['status']);
        $this->assertSame('No stock', $row['decline_reason']);
        $this->assertArrayHasKey('completion_notes', $row);
    }
}
