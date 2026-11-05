<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\ServiceRequest;
use App\Models\ServiceRequestAttachment;
use App\Models\User;
use App\Support\ServiceTypes;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Run with the guarded private-MySQL bootstrap; no migrations are required. */
class ServiceRetirementTest extends TestCase
{
    private User $owner;
    private User $staff;
    private User $super;
    private User $vet;
    private Farm $farm;
    private bool $transaction = false;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('PHASE7_TEST_MYSQL') !== '1') $this->markTestSkipped('Explicit private MySQL fixture required.');
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.mysql.host'), ['localhost', '127.0.0.1', '::1']);
        DB::beginTransaction(); $this->transaction = true;
        Http::fake(); Mail::fake();
        config(['filesystems.disks.local.root' => sys_get_temp_dir().'/agribantay-phase7-'.Str::uuid(), 'filesystems.disks.local.throw' => true]);
        Storage::forgetDisk('local');
        $this->owner = $this->user('farm_owner'); $this->staff = $this->user('admin');
        $this->super = $this->user('super_admin'); $this->vet = $this->user('vet');
        $this->farm = Farm::create(['user_id' => $this->owner->id, 'farm_name' => 'Retirement Fixture '.Str::random(8),
            'owner_name' => $this->owner->full_name, 'mobile_number' => $this->owner->mobile_number,
            'barangay' => 'Calansayan', 'address' => 'Synthetic fixture', 'farm_size' => 'Small', 'status' => 'Active']);
        $this->actingAs($this->owner, 'sanctum');
    }

    protected function tearDown(): void
    {
        if ($this->transaction) DB::rollBack();
        parent::tearDown();
    }

    private function user(string $role): User
    {
        return User::create(['first_name' => 'Phase7', 'last_name' => Str::random(8), 'role' => $role, 'status' => 'active',
            'mobile_number' => '09'.random_int(100000000, 999999999), 'password' => bcrypt('synthetic-only')]);
    }

    private function record(string $type, string $status, ?User $handler = null): ServiceRequest
    {
        return ServiceRequest::forceCreate(['farm_id' => $this->farm->id, 'requested_by' => $this->owner->id,
            'request_number' => 'SR-'.random_int(100000, 999999), 'service_type' => $type, 'status' => $status,
            'accepted_by' => $handler?->id, 'notes' => 'Original historical note',
            'scheduled_at' => $status === 'Scheduled' ? now()->subDays(3) : null,
            'completed_at' => $status === 'Completed' ? now()->subDay() : null])->fresh();
    }

    private function evidence(): array
    {
        return array_map(fn ($table) => DB::table($table)->count(), ['service_requests', 'activity_logs', 'notifications', 'sms_logs']);
    }

    public function test_both_retired_creation_types_are_rejected_without_notifications_or_records(): void
    {
        $before = $this->evidence();
        foreach (ServiceTypes::RETIRED as $type) {
            $this->postJson('/api/farmer/service-requests', ['farm_id' => $this->farm->id, 'service_type' => $type])
                ->assertUnprocessable()->assertJsonValidationErrors('service_type');
        }
        $this->assertSame($before, $this->evidence()); Http::assertNothingSent(); Mail::assertNothingOutgoing();
    }

    public static function retiredActions(): array
    {
        $cases = [];
        foreach (['admin', 'super_admin'] as $role) foreach (ServiceTypes::RETIRED as $type) foreach (['accept', 'decline', 'complete', 'reschedule', 'reopen', 'cancel'] as $action) {
            $cases[$role.' '.$type.' '.$action] = [$role, $type, $action];
        }
        return $cases;
    }

    #[DataProvider('retiredActions')]
    public function test_every_staff_endpoint_protects_retired_rows_including_super_admin_override(string $role, string $type, string $action): void
    {
        $actor = $role === 'admin' ? $this->staff : $this->super;
        $status = in_array($action, ['accept', 'decline']) ? 'Pending' : ($action === 'reopen' ? 'Completed' : 'Scheduled');
        $sr = $this->record($type, $status, $actor);
        $original = $sr->getAttributes(); $before = $this->evidence();
        $this->actingAs($actor, 'sanctum')->patchJson('/api/admin/service-requests/'.$sr->id.'/'.$action,
            ['scheduled_at' => now()->addDay()->format('Y-m-d').' 09:00:00', 'reason' => 'Fixture change', 'decline_reason' => 'Fixture reason', 'completion_notes' => 'Fixture completion'])
            ->assertStatus(409);
        $this->assertSame($original, $sr->fresh()->getAttributes()); $this->assertSame($before, $this->evidence()); Http::assertNothingSent();
    }

    public function test_vet_routes_cannot_bypass_retirement_or_remove_historical_attachments(): void
    {
        foreach (['accept', 'decline', 'complete', 'reschedule', 'reopen'] as $action) {
            $sr = $this->record(ServiceTypes::ODOR_CONTROL, $action === 'reopen' ? 'Completed' : (in_array($action, ['accept','decline']) ? 'Pending' : 'Scheduled'), $this->vet);
            $before = $sr->getAttributes();
            $this->actingAs($this->vet, 'sanctum')->patchJson('/api/vet/vaccination-requests/'.$sr->id.'/'.$action,
                ['scheduled_at' => now()->addDay()->format('Y-m-d').' 09:00:00', 'reason' => 'Fixture reason', 'decline_reason' => 'Fixture decline', 'completion_notes' => 'Fixture complete'])
                ->assertStatus(409);
            $this->assertSame($before, $sr->fresh()->getAttributes());
        }
        $sr = $this->record(ServiceTypes::FLY_CONTROL, 'Scheduled', $this->super);
        $path = 'service-request-attachments/'.$sr->id.'/fixture.pdf'; Storage::disk('local')->put($path, '%PDF-1.4 synthetic');
        $attachment = $sr->attachments()->create(['uploaded_by' => $this->staff->id, 'file_path' => $path, 'original_name' => 'legacy.pdf', 'mime_type' => 'application/pdf', 'file_size' => 20]);
        $this->actingAs($this->super, 'sanctum')->deleteJson('/api/vet/vaccination-requests/'.$sr->id.'/attachments/'.$attachment->id)->assertStatus(409);
        Storage::disk('local')->assertExists($path); $this->assertNotNull($attachment->fresh());
    }

    public function test_retired_list_bookmarks_are_empty_while_farm_audit_history_is_preserved(): void
    {
        $ids = [];
        foreach (['Pending','Scheduled','Completed','Cancelled'] as $status) $ids[] = $this->record(ServiceTypes::ODOR_CONTROL, $status)->id;
        $this->record(ServiceTypes::BLOOD_TEST, 'Pending');
        $this->actingAs($this->staff, 'sanctum')->getJson('/api/admin/service-requests?tab=pending&per_page=10')->assertOk()->assertJsonPath('data.total', 0);
        $this->getJson('/api/admin/service-requests?tab=legacy&per_page=2&page=2&sort=oldest&search='.$this->farm->farm_name)
            ->assertOk()->assertJsonPath('data.total', 0)->assertJsonCount(0, 'data.items')->assertJsonPath('data.counts.pending', 0);
        $this->actingAs($this->super, 'sanctum')->getJson('/api/admin/farms/'.$this->farm->id.'/service-requests?per_page=10')
            ->assertOk()->assertJsonPath('data.total', 4);
        $this->assertEqualsCanonicalizing($ids, ServiceRequest::where('farm_id', $this->farm->id)->whereIn('service_type', ServiceTypes::RETIRED)->pluck('id')->all());
    }

    public function test_farmer_and_super_admin_queues_exclude_legacy_but_keep_vet_work(): void
    {
        $this->record(ServiceTypes::ODOR_CONTROL, 'Pending'); $this->record(ServiceTypes::FLY_CONTROL, 'Scheduled');
        $this->record(ServiceTypes::FARM_BIOSECURITY, 'Pending'); $vet = $this->record(ServiceTypes::BLOOD_TEST, 'Scheduled');
        $this->record(ServiceTypes::ODOR_CONTROL, 'Completed'); $this->record(ServiceTypes::BLOOD_TEST, 'Completed');
        $this->getJson('/api/farmer/service-requests?farm_id='.$this->farm->id.'&tab=active&per_page=10')->assertOk()->assertJsonPath('data.total', 2)->assertJsonPath('data.counts.active', 2);
        $this->getJson('/api/farmer/service-requests?farm_id='.$this->farm->id.'&tab=legacy&per_page=10')->assertOk()->assertJsonPath('data.total', 0);
        $this->getJson('/api/farmer/dashboard?farm_id='.$this->farm->id)->assertOk()->assertJsonPath('data.pending_requests', 2)->assertJsonPath('data.next_scheduled_visit.service_type', $vet->service_type);
        $this->actingAs($this->super, 'sanctum')->getJson('/api/admin/service-requests?tab=overdue&per_page=10')->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.id', $vet->id);
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.active_requests', 2)->assertJsonPath('data.resolved_requests', 1);
        $this->actingAs($this->staff, 'sanctum')->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.active_requests', 0)->assertJsonPath('data.resolved_requests', 0)->assertJsonMissingPath('data.fly_odor_summary');
    }

    public function test_historical_attachments_still_have_original_authorized_access(): void
    {
        $sr = $this->record(ServiceTypes::FLY_CONTROL, 'Scheduled');
        $path = 'service-request-attachments/'.$sr->id.'/history.pdf'; Storage::disk('local')->put($path, '%PDF-1.4 original');
        $a = ServiceRequestAttachment::create(['service_request_id' => $sr->id, 'uploaded_by' => $this->staff->id,
            'file_path' => $path, 'original_name' => 'history.pdf', 'mime_type' => 'application/pdf', 'file_size' => 20]);
        $url = '/api/service-requests/'.$sr->id.'/attachments/'.$a->id;
        foreach ([$this->staff, $this->super] as $user) $this->actingAs($user, 'sanctum')->getJson($url)->assertOk();
        $this->actingAs($this->owner, 'sanctum')->getJson($url)->assertForbidden();
        $this->getJson('/api/service-requests/'.$sr->id.'/attachment')->assertForbidden();
        $this->actingAs($this->user('farm_owner'), 'sanctum')->getJson($url)->assertForbidden();
        Storage::disk('local')->assertExists($path); $this->assertSame('Scheduled', $sr->fresh()->status);
    }

    public function test_current_vet_services_can_still_be_requested_scheduled_and_completed(): void
    {
        foreach (ServiceTypes::REQUESTABLE as $type) {
            $this->actingAs($this->owner, 'sanctum');
            $id = $this->postJson('/api/farmer/service-requests', ['farm_id' => $this->farm->id, 'service_type' => $type])->assertOk()->json('data.id');
            $this->actingAs($this->vet, 'sanctum')->patchJson('/api/vet/vaccination-requests/'.$id.'/accept', ['scheduled_at' => now()->addDay()->format('Y-m-d').' 09:00:00'])->assertOk();
            $this->patchJson('/api/vet/vaccination-requests/'.$id.'/reschedule', ['scheduled_at' => now()->addDays(2)->format('Y-m-d').' 10:00:00', 'reason' => 'Synthetic valid reschedule'])->assertOk();
            $file = UploadedFile::fake()->createWithContent('form.pdf', "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
            $this->post('/api/vet/vaccination-requests/'.$id.'/complete', ['completion_notes' => 'Valid Vet visit', 'attachment' => $file], ['Accept' => 'application/json'])->assertOk();
            $this->assertSame('Completed', ServiceRequest::findOrFail($id)->status);
        }
        $this->assertSame([ServiceTypes::FARM_BIOSECURITY, ServiceTypes::BLOOD_TEST], ServiceTypes::REQUESTABLE);
    }

    public function test_farmer_cannot_recover_retired_rows_through_any_tab_filter_or_page(): void
    {
        $old = $this->record(ServiceTypes::ODOR_CONTROL, 'Completed');
        $this->record(ServiceTypes::FLY_CONTROL, 'Scheduled');
        $valid = $this->record(ServiceTypes::BLOOD_TEST, 'Completed');
        $original = $old->fresh()->getAttributes();
        foreach (['', '&tab=legacy', '&tab=past&service_type='.urlencode(ServiceTypes::ODOR_CONTROL), '&tab=active&search='.$old->request_number, '&page=2'] as $filter) {
            $rows = $this->getJson('/api/farmer/service-requests?farm_id='.$this->farm->id.'&per_page=1'.$filter)->assertOk()->json('data.items');
            foreach ($rows as $row) $this->assertContains($row['service_type'], ServiceTypes::VET);
        }
        $unpaged = $this->getJson('/api/farmer/service-requests?farm_id='.$this->farm->id)->assertOk()->json('data');
        $this->assertArrayNotHasKey('legacy', $unpaged);
        $this->assertSame([$valid->id], array_column($unpaged['past'], 'id'));
        $other = Farm::create(['user_id' => $this->owner->id, 'farm_name' => 'Second synthetic farm', 'owner_name' => 'Fixture Owner', 'farm_size' => 'Small', 'status' => 'Active', 'barangay' => 'Calansayan', 'address' => 'Fixture', 'mobile_number' => $this->owner->mobile_number]);
        $this->getJson('/api/farmer/service-requests?farm_id='.$other->id.'&per_page=1')->assertOk()->assertJsonPath('data.total', 0);
        $this->actingAs($this->user('farm_owner'), 'sanctum')->getJson('/api/farmer/service-requests?farm_id='.$this->farm->id)->assertNotFound();
        $this->assertSame($original, $old->fresh()->getAttributes());
    }

    public function test_farmer_notifications_hide_retired_events_and_counts_without_modifying_history(): void
    {
        $old = \App\Models\Notification::create(['user_id' => $this->owner->id, 'title' => 'Service Request Scheduled', 'message' => 'Your Odor Control Request has been scheduled.', 'type' => 'Request Update', 'link' => '/farmowner/service-requests', 'is_read' => false]);
        $valid = \App\Models\Notification::create(['user_id' => $this->owner->id, 'title' => 'Service Request Declined', 'message' => 'Your Blood Test Request was declined: Odor Control documents are separate.', 'type' => 'Request Update', 'link' => '/farmowner/service-requests', 'is_read' => false]);
        $general = \App\Models\Notification::create(['user_id' => $this->owner->id, 'title' => 'General notice', 'message' => 'Synthetic notice', 'type' => 'Maintenance', 'link' => null, 'is_read' => false]);
        $original = $old->fresh()->getAttributes();
        $this->getJson('/api/notifications?limit=100')->assertOk()->assertJsonPath('total_count', 2)->assertJsonPath('unread_count', 2);
        $this->patchJson('/api/notifications/'.$old->id.'/read')->assertNotFound();
        $this->patchJson('/api/notifications/read-all')->assertOk();
        $this->assertSame($original, $old->fresh()->getAttributes());
        $this->assertTrue($valid->fresh()->is_read); $this->assertTrue($general->fresh()->is_read);
    }

    public function test_report_preserves_legacy_totals_without_rewriting_saved_snapshots(): void
    {
        $this->record(ServiceTypes::ODOR_CONTROL, 'Pending'); $this->record(ServiceTypes::FLY_CONTROL, 'Completed');
        $snapshots = DB::table('generated_reports')->orderBy('id')->pluck('snapshot', 'id')->all();
        $this->actingAs($this->staff, 'sanctum')->getJson('/api/admin/reports')->assertOk()->assertJsonPath('data.service_summary.is_legacy', true);
        $this->assertSame($snapshots, DB::table('generated_reports')->orderBy('id')->pluck('snapshot', 'id')->all());
    }
}
