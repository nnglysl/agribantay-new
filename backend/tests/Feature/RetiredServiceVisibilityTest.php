<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\ServiceRequest;
use App\Models\User;
use App\Support\ServiceTypes;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Explicit in-memory fixtures only: no source database, migrations or providers. */
class RetiredServiceVisibilityTest extends TestCase
{
    private User $super;
    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'retired_visibility', 'database.connections.retired_visibility' => [
            'driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true,
        ], 'cache.default' => 'array', 'session.driver' => 'array']);
        DB::purge('retired_visibility');
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        Http::preventStrayRequests(); Mail::fake();
        Schema::create('users', function (Blueprint $t) {
            $t->id(); foreach (['first_name','last_name','role','status'] as $n) $t->string($n);
            $t->timestamps();
        });
        Schema::create('farms', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('user_id');
            foreach (['farm_name','owner_name','barangay','farm_size','status'] as $n) $t->string($n);
            $t->timestamps();
        });
        Schema::create('service_requests', function (Blueprint $t) {
            $t->id(); foreach (['farm_id','requested_by','accepted_by'] as $n) $t->unsignedBigInteger($n)->nullable();
            foreach (['request_number','service_type','status','priority','notes','completion_notes','decline_reason','reschedule_reason'] as $n) $t->text($n)->nullable();
            foreach (['scheduled_at','previous_scheduled_at','completed_at'] as $n) $t->timestamp($n)->nullable();
            $t->timestamps();
        });
        Schema::create('service_request_attachments', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('service_request_id'); $t->unsignedBigInteger('uploaded_by');
            foreach (['file_path','original_name','mime_type'] as $n) $t->string($n);
            $t->unsignedInteger('file_size'); $t->timestamps();
        });
        Schema::create('notifications', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('user_id');
            foreach (['title','message','type','link'] as $n) $t->text($n)->nullable();
            $t->boolean('is_read')->default(false); $t->timestamps();
        });
        foreach (['activity_logs','generated_reports'] as $table) Schema::create($table, function (Blueprint $t) {
            $t->id(); $t->text('snapshot');
        });
        Schema::create('sensors', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('farm_id')->nullable(); $t->string('status'); $t->timestamp('last_seen_at')->nullable();
        });
        Schema::create('inspections', function (Blueprint $t) {
            $t->id(); $t->string('status'); $t->timestamp('scheduled_at')->nullable();
        });
        Schema::create('maintenance_logs', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('farm_id'); $t->string('maintenance_type'); $t->date('performed_at');
        });
        $this->super = $this->user('super_admin');
        $this->owner = $this->user('farm_owner');
        DB::table('farms')->insert(['id' => 1, 'user_id' => $this->owner->id, 'farm_name' => 'Synthetic farm',
            'owner_name' => 'Synthetic Owner', 'barangay' => 'Calansayan', 'farm_size' => 'Small', 'status' => 'Inactive']);
        foreach ([...ServiceTypes::RETIRED, ...ServiceTypes::VET] as $type) {
            foreach (['Pending','Scheduled','Overdue','Completed','Cancelled'] as $status) {
                ServiceRequest::create(['farm_id' => 1, 'requested_by' => $this->owner->id,
                    'request_number' => 'SR-'.(ServiceRequest::count()+1), 'service_type' => $type,
                    'status' => $status === 'Overdue' ? 'Scheduled' : $status, 'notes' => 'Original fixture',
                    'scheduled_at' => $status === 'Overdue' ? now()->subDays(3) : ($status === 'Scheduled' ? now()->addDays(3) : null)]);
            }
        }
        DB::table('service_request_attachments')->insert(['service_request_id' => 1, 'uploaded_by' => $this->super->id,
            'file_path' => 'historical/unchanged.pdf', 'original_name' => 'original.pdf', 'mime_type' => 'application/pdf', 'file_size' => 12]);
        foreach (['activity_logs','generated_reports'] as $table) DB::table($table)->insert(['snapshot' => 'Original Odor Control Request audit data']);
        $this->actingAs($this->super, 'sanctum');
    }

    protected function tearDown(): void
    {
        DB::purge('retired_visibility');
        parent::tearDown();
    }

    private function user(string $role): User
    {
        return User::create(['first_name' => 'Synthetic', 'last_name' => $role, 'role' => $role, 'status' => 'active']);
    }

    private function rows(): array
    {
        $rows = [];
        foreach (['service_requests','service_request_attachments','notifications','activity_logs','generated_reports'] as $table) {
            $rows[$table] = DB::table($table)->orderBy('id')->get()->toJson();
        }
        return $rows;
    }

    public function test_all_active_tabs_filters_counts_and_legacy_bookmarks_preserve_every_original_row(): void
    {
        $before = $this->rows(); $queries = [];
        DB::listen(function ($query) use (&$queries) { $queries[] = $query->sql; });
        foreach (['pending' => 3,'scheduled' => 3,'overdue' => 3,'history' => 6,'legacy' => 0] as $tab => $total) {
            $response = $this->getJson('/api/admin/service-requests?tab='.$tab.'&per_page=2&page=2')->assertOk()
                ->assertJsonPath('data.total', $total)->assertJsonPath('data.counts.pending', 3)
                ->assertJsonPath('data.counts.scheduled', 3)->assertJsonPath('data.counts.overdue', 3)
                ->assertJsonPath('data.counts.history', 6);
            foreach ($response->json('data.items') as $row) $this->assertContains($row['service_type'], ServiceTypes::VET);
        }
        foreach (ServiceTypes::RETIRED as $type) $this->getJson('/api/admin/service-requests?per_page=10&service_type='.urlencode($type))
            ->assertOk()->assertJsonPath('data.total', 0)->assertJsonPath('data.counts.active', 0);
        $this->getJson('/api/admin/service-requests?per_page=10&search=Odor')->assertOk()->assertJsonPath('data.total', 0);
        $unpaged = $this->getJson('/api/admin/service-requests')->assertOk()->json('data');
        $this->assertCount(15, $unpaged);
        $this->assertContains(ServiceTypes::FARM_BIOSECURITY, array_column($unpaged, 'service_type'));
        $this->getJson('/api/admin/farms/1/service-requests?per_page=100')->assertOk()->assertJsonPath('data.total', 13);
        $this->assertSame($before, $this->rows());
        foreach ($queries as $query) $this->assertDoesNotMatchRegularExpression('/^\s*(insert|update|delete|replace|alter|drop)\b/i', $query);
        Http::assertNothingSent(); Mail::assertNothingOutgoing();
    }

    public function test_staff_bookmarks_cannot_expose_retired_requests_or_grant_vet_access(): void
    {
        $this->actingAs($this->user('admin'), 'sanctum'); $before = $this->rows();
        foreach (['','pending','scheduled','overdue','history','legacy'] as $tab) $this->getJson('/api/admin/service-requests?per_page=10&tab='.$tab)
            ->assertOk()->assertJsonPath('data.total', 0);
        $this->assertSame($before, $this->rows());
    }

    public function test_farmer_and_vet_lists_keep_current_services_and_hide_retired_filters(): void
    {
        $vet = $this->user('vet'); $before = $this->rows();
        foreach ([[$this->owner, '/api/farmer/service-requests?farm_id=1&'], [$vet, '/api/vet/vaccination-requests?']] as [$actor, $url]) {
            $this->actingAs($actor, 'sanctum');
            foreach (['active' => 9, 'history' => 6, 'legacy' => 0] as $tab => $total) {
                $response = $this->getJson($url.'per_page=100&tab='.$tab)->assertOk()->assertJsonPath('data.total', $total);
                foreach ($response->json('data.items') as $row) $this->assertContains($row['service_type'], ServiceTypes::VET);
            }
            $this->getJson($url.'per_page=100&service_type='.urlencode(ServiceTypes::FARM_BIOSECURITY))
                ->assertOk()->assertJsonPath('data.total', 5);
            $this->getJson($url.'per_page=100&service_type='.urlencode(ServiceTypes::ODOR_CONTROL))
                ->assertOk()->assertJsonPath('data.total', 0);
        }
        $this->assertSame($before, $this->rows());
    }

    public function test_dashboard_totals_include_current_services_only(): void
    {
        $before = $this->rows();
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.active_requests', 9)
            ->assertJsonPath('data.resolved_requests', 3)
            ->assertJsonMissingPath('data.fly_odor_summary');
        $this->assertSame($before, $this->rows());
    }

    public function test_every_role_hides_retired_notifications_and_badges_without_changing_the_hidden_rows(): void
    {
        foreach (['farm_owner','admin','super_admin','vet'] as $role) {
            $user = $this->user($role); $hidden = [];
            foreach (ServiceTypes::RETIRED as $type) foreach (['Your ', 'The ', 'New '] as $prefix) {
                $hidden[] = Notification::create(['user_id' => $user->id, 'title' => 'New Service Request',
                    'message' => $prefix.$type.' from "Fixture farm".', 'type' => 'Request Update',
                    'link' => '/superadmin/service-requests', 'is_read' => false])->id;
            }
            foreach ([['Your Farm Biosecurity Request was declined: Odor Control documents are separate.', 'Request Update', '/farmowner/service-requests'],
                ['Fly Control document received.', 'Control Document', '/farms/1/control-documents'], [null, null, null]] as [$message,$type,$link]) {
                Notification::create(['user_id' => $user->id, 'title' => 'Fixture notice', 'message' => $message, 'type' => $type, 'link' => $link]);
            }
            $this->actingAs($user, 'sanctum'); $before = $this->rows();
            $response = $this->getJson('/api/notifications?limit=1')->assertOk()->assertJsonPath('total_count', 3)
                ->assertJsonPath('unread_count', 3)->assertJsonPath('has_more', true);
            $this->assertEmpty(array_intersect($hidden, array_column($response->json('data'), 'id')));
            $this->assertSame($before, $this->rows());
            foreach ($hidden as $id) $this->patchJson('/api/notifications/'.$id.'/read')->assertNotFound();
            $originalHidden = DB::table('notifications')->whereIn('id', $hidden)->get()->toJson();
            $this->patchJson('/api/notifications/read-all')->assertOk();
            $this->assertSame($originalHidden, DB::table('notifications')->whereIn('id', $hidden)->get()->toJson());
        }
    }
}
