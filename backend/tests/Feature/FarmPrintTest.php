<?php
namespace Tests\Feature;

use App\Models\{Farm, User, Sensor, SensorReading, MaintenanceLog, FarmControlDocument, ServiceRequest, Inspection, AlertHistory};
use App\Services\{DeviceAssignmentService, MaintenanceStatusService};
use Illuminate\Support\Facades\{DB, Http, Mail, Schema};
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

class FarmPrintTest extends TestCase
{
    private bool $transaction = false;
    private User $staff; private User $super; private Farm $farm; private Farm $other;
    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('PHASE9_TEST_MYSQL') !== '1') $this->markTestSkipped('Explicit private MySQL fixture required.');
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.mysql.host'), ['127.0.0.1','localhost','::1']);
        DB::beginTransaction(); $this->transaction = true; Http::preventStrayRequests(); Http::fake(); Mail::fake();
        $this->travelTo(Carbon::parse('2026-11-01 04:00:00', 'UTC'));
        $this->staff = $this->user('admin'); $this->super = $this->user('super_admin');
        $owner = $this->user('farm_owner');
        $this->farm = $this->farm($owner, 'Print Farm'); $this->other = $this->farm($owner, 'Other Secret Farm');
        $this->actingAs($this->staff, 'sanctum');
    }
    protected function tearDown(): void { if ($this->transaction) DB::rollBack(); $this->travelBack(); parent::tearDown(); }
    private function user(string $role): User {
        if ($role === 'super_admin') return User::where('role', 'super_admin')->sole();
        return User::create(['first_name'=>'Print','last_name'=>Str::random(8),'role'=>$role,'status'=>'active','mobile_number'=>'09'.random_int(100000000,999999999),'password'=>bcrypt('synthetic-only'),'email'=>Str::uuid().'@example.test']);
    }
    private function farm(User $owner, string $name): Farm { return Farm::forceCreate(['user_id'=>$owner->id,'farm_name'=>$name,'owner_name'=>$owner->full_name,'farm_size'=>'Large','barangay'=>'Calansayan','address'=>'Synthetic address','mobile_number'=>$owner->mobile_number,'status'=>'Active','created_at'=>'2025-10-31 02:00:00'])->fresh(); }
    private function url(string $action, ?Farm $farm = null): string { return '/api/admin/farms/'.($farm??$this->farm)->id.'/print-'.$action; }
    private function prepare(array $sections, array $extra = []): array { return $this->postJson($this->url('preview'), array_merge(['sections'=>$sections,'date_mode'=>'all'],$extra))->assertOk()->json('data'); }
    private function batch(array $p, string $section, int $after = 0, ?Farm $farm = null) { return $this->postJson($this->url('batch',$farm),['ticket'=>$p['ticket'],'section'=>$section,'after_id'=>$after]); }
    private function service(string $type, string $status, ?Farm $farm = null): void { ServiceRequest::forceCreate(['farm_id'=>($farm??$this->farm)->id,'requested_by'=>$this->farm->user_id,'request_number'=>'PRINT-'.Str::random(9),'service_type'=>$type,'status'=>$status,'created_at'=>'2026-10-31 02:00:00']); }

    public function test_only_staff_and_super_admin_can_access_every_print_endpoint(): void
    {
        $p=$this->prepare(['farm']);
        foreach (['farm_owner','vet'] as $role) {
            $this->actingAs($this->user($role),'sanctum')->getJson($this->url('options'))->assertForbidden();
            $this->postJson($this->url('preview'),['sections'=>['farm'],'date_mode'=>'all'])->assertForbidden();
            $this->batch($p,'readings')->assertForbidden();
        }
        $this->actingAs($this->super,'sanctum')->getJson($this->url('options'))->assertOk()->assertJsonPath('data.farm.id',$this->farm->id);
        $this->getJson('/api/admin/farms/999999999/print-options')->assertNotFound();
        $this->getJson('/api/admin/farms/not-an-id/print-options')->assertNotFound();
        $this->getJson('/api/admin/farms/999999999999999999999999999999/print-options')->assertNotFound();
    }
    public function test_selection_validation_dates_and_farm_identity_cannot_be_overridden(): void
    {
        foreach ([['sections'=>[]],['sections'=>['secret']],['sections'=>['farm','farm']],['sections'=>['farm'],'farm_id'=>$this->other->id],['sections'=>['readings'],'date_mode'=>'custom','from'=>'2026-11-02','to'=>'2026-11-01'],['sections'=>['readings'],'date_mode'=>'custom','from'=>'2026-02-30','to'=>'2026-03-01']] as $input) $this->postJson($this->url('preview'),$input+['date_mode'=>'all'])->assertUnprocessable();
        $p=$this->prepare(['owner']); $this->assertSame(['owner'],array_keys($p['snapshots'])); $this->assertSame($this->farm->user->full_name,$p['generated_by'] === $this->staff->full_name ? $p['farm']['owner_name'] : 'Wrong actor');
        $this->assertSame($this->staff->full_name,$p['generated_by']);
        $this->assertArrayNotHasKey('password',$p['snapshots']['owner']);
    }
    public function test_raw_history_uses_stored_farm_association_after_unassignment_and_a_b_a_rotation(): void
    {
        $sensor=Sensor::create(['label'=>'PRINT-'.Str::random(6),'device_key'=>'DO-NOT-PRINT','status'=>'Active']);
        $assign=app(DeviceAssignmentService::class);
        $assign->change($sensor->id,$this->farm->id);
        $a=SensorReading::create(['farm_id'=>$this->farm->id,'sensor_id'=>$sensor->id,'ammonia'=>123.45,'moisture'=>42,'ammonia_status'=>'Warning','is_mock'=>true]);
        $assign->change($sensor->id,$this->other->id);
        $b=SensorReading::create(['farm_id'=>$this->other->id,'sensor_id'=>$sensor->id,'ammonia'=>987.65,'is_mock'=>true]);
        $assign->change($sensor->id,$this->farm->id);
        $p=$this->prepare(['readings','monitoring','assignments']);
        $this->assertNull($p['snapshots']['monitoring'][0]['ammonia']);
        $this->assertStringNotContainsString('DO-NOT-PRINT',json_encode($p));
        $this->batch($p,'readings')->assertOk()->assertJsonPath('data.items.0.id',$a->id)->assertJsonCount(1,'data.items');
        $assign->change($sensor->id,null);
        $p=$this->prepare(['readings','monitoring']); $this->assertSame([],$p['snapshots']['monitoring']);
        $this->batch($p,'readings')->assertOk()->assertJsonPath('data.items.0.ammonia','123.45')->assertJsonPath('data.items.0.conditions.ammonia','Warning');
        $this->assertNotSame($a->id,$b->id);
    }
    public function test_manila_date_boundaries_and_calendar_dates_are_applied_before_batching(): void
    {
        foreach (['2026-10-30 15:59:59','2026-10-30 16:00:00','2026-10-31 15:59:59','2026-10-31 16:00:00'] as $at) SensorReading::forceCreate(['farm_id'=>$this->farm->id,'ammonia'=>10,'created_at'=>$at]);
        MaintenanceLog::create(['farm_id'=>$this->farm->id,'maintenance_type'=>'Full Manure Clean-out','performed_at'=>'2026-10-31','photo_path'=>'private-not-printed.jpg']);
        $p=$this->prepare(['readings','cleanouts','compliance'],['date_mode'=>'custom','from'=>'2026-10-31','to'=>'2026-10-31']);
        $this->assertSame(2,$p['streams']['readings']['total']); $this->assertSame(1,$p['streams']['cleanouts']['total']);
        $this->batch($p,'readings')->assertOk()->assertJsonCount(2,'data.items');
        $this->assertSame(app(MaintenanceStatusService::class)->getStatus($this->farm),$p['snapshots']['compliance']);
        $this->assertStringNotContainsString('private-not-printed',json_encode($this->batch($p,'cleanouts')->assertOk()->json()));
    }
    public function test_all_matching_pages_are_retrievable_and_new_rows_cannot_extend_a_manifest(): void
    {
        $rows=array_fill(0,1001,['farm_id'=>$this->farm->id,'ammonia'=>0,'moisture'=>40,'created_at'=>'2026-10-31 01:00:00','updated_at'=>'2026-10-31 01:00:00']); SensorReading::insert($rows);
        $p=$this->prepare(['readings']); $this->assertSame(1001,$p['streams']['readings']['total']);
        SensorReading::create(['farm_id'=>$this->farm->id,'ammonia'=>999]);
        $all=[];$cursor=0;$calls=0;
        do { $b=$this->batch($p,'readings',$cursor)->assertOk()->json('data'); $all=array_merge($all,array_column($b['items'],'id'));$cursor=$b['next_after_id'];$calls++; } while($b['has_more']);
        $this->assertCount(1001,$all);$this->assertSame(3,$calls);$this->assertCount(1001,array_unique($all));
        $this->assertSame($p['streams']['readings']['max_id'],$cursor);
    }
    public function test_large_selection_is_explicitly_rejected_instead_of_truncated(): void
    {
        SensorReading::insert(array_fill(0,3,['farm_id'=>$this->farm->id,'ammonia'=>10,'created_at'=>'2026-10-31 01:00:00']));
        config(['farm_print.max_preview_rows'=>2]);
        $response=$this->postJson($this->url('preview'),['sections'=>['readings'],'date_mode'=>'all'])->assertUnprocessable()->assertJsonValidationErrors('sections');
        $this->assertStringContainsString('no records were truncated',$response->json('errors.sections.0'));
    }
    public function test_tickets_are_bound_to_actor_role_farm_selection_and_expiry(): void
    {
        $p=$this->prepare(['readings']);
        $this->batch($p,'readings',0,$this->other)->assertForbidden(); $this->batch($p,'services')->assertUnprocessable();
        $this->actingAs($this->super,'sanctum');$this->batch($p,'readings')->assertForbidden();
        $this->actingAs($this->staff,'sanctum');$p['ticket']='forged';$this->batch($p,'readings')->assertUnprocessable();
        $p=$this->prepare(['readings']);$this->travel(31)->minutes();$this->batch($p,'readings')->assertStatus(409);
    }
    public function test_staff_cannot_print_vet_records_and_super_admin_preserves_authorized_vet_and_retired_statuses(): void
    {
        $this->service('Odor Control Request','Scheduled');$this->service('Fly Control Request','Completed');
        $this->service('Farm Biosecurity Request','Pending');$this->service('Blood Test Request','Completed');$this->service('Odor Control Request','Completed',$this->other);
        $p=$this->prepare(['services']);$this->assertSame(2,$p['streams']['services']['total']);
        $this->batch($p,'services')->assertOk()->assertJsonPath('data.items.0.status','Scheduled')->assertJsonPath('data.items.0.is_retired',true);
        $this->actingAs($this->super,'sanctum');$p=$this->prepare(['services']);$this->assertSame(4,$p['streams']['services']['total']);
    }
    public function test_documents_are_metadata_only_and_latest_status_does_not_invent_approval(): void
    {
        $this->assertTrue(Schema::hasTable('farm_control_documents'),'Use the retained Phase 6 private schema fixture.');
        foreach ([$this->farm,$this->other] as $farm) FarmControlDocument::create(['farm_id'=>$farm->id,'uploaded_by'=>$this->staff->id,'uploader_name'=>'Recorded Uploader','category'=>'odor_control','original_name'=>'record.pdf','file_path'=>'private-secret-'.Str::uuid(),'mime_type'=>'application/pdf','file_size'=>15]);
        $p=$this->prepare(['documents']);$b=$this->batch($p,'documents')->assertOk()->assertJsonCount(1,'data.items')->assertJsonPath('data.items.0.status','On File')->json('data.items.0');
        $this->assertArrayNotHasKey('file_path',$b);$this->assertArrayNotHasKey('url',$b);$this->assertSame('Recorded Uploader',$b['uploaded_by']);
    }
    public function test_preview_is_read_only_even_for_alerts_and_unknown_compliance(): void
    {
        $this->farm->timestamps=false;$this->farm->forceFill(['created_at'=>null])->saveQuietly();
        Inspection::create(['inspection_number'=>'PR-'.Str::random(8),'farm_id'=>$this->farm->id,'inspection_type'=>'Follow-up','status'=>'Completed','scheduled_at'=>'2026-10-31 01:00:00','findings'=>'Original findings']);
        AlertHistory::create(['farm_id'=>$this->farm->id,'sensor_type'=>'ammonia','status'=>'Warning','value'=>123.4,'triggered_at'=>'2026-10-31 02:00:00']);
        $tables=['farms','users','sensor_readings','alert_history','maintenance_logs','service_requests','notifications','sms_logs','generated_reports','activity_logs'];
        $evidence=fn()=>array_map(fn($t)=>hash('sha256',DB::table($t)->orderBy('id')->get()->toJson()),$tables);
        $before=$evidence();$p=$this->prepare(['farm','owner','monitoring','compliance','alerts','inspections']);
        $this->assertSame('Undetermined',$p['snapshots']['compliance']['status']);
        $this->batch($p,'alerts')->assertOk()->assertJsonPath('data.items.0.status','Warning');$this->batch($p,'inspections')->assertOk()->assertJsonPath('data.items.0.inspection_type','Follow-up');
        $this->assertSame($before,$evidence());Http::assertNothingSent();Mail::assertNothingOutgoing();
    }
    public function test_unavailable_documents_are_not_misrepresented_as_empty_and_inactive_accounts_are_denied(): void
    {
        Schema::partialMock()->shouldReceive('hasTable')->with('farm_control_documents')->andReturn(false);
        $options=$this->getJson($this->url('options'))->assertOk()->json('data.sections');
        $this->assertFalse(collect($options)->firstWhere('key','documents')['available']);
        $this->postJson($this->url('preview'),['sections'=>['documents'],'date_mode'=>'all'])->assertStatus(503);
        $this->staff->update(['status'=>'inactive']);
        $this->getJson($this->url('options'))->assertUnauthorized();
    }
    public function test_missing_alerting_values_or_offline_state_cannot_print_safe(): void
    {
        config(['sensors.alerting_metrics'=>['ammonia','moisture']]);
        $sensor=Sensor::create(['label'=>'PRINT-CURRENT-'.Str::random(5),'device_key'=>'NEVER-PRINT','status'=>'Active']);
        app(DeviceAssignmentService::class)->change($sensor->id,$this->farm->id);
        $sensor->update(['last_seen_at'=>now()]);
        SensorReading::create(['farm_id'=>$this->farm->id,'sensor_id'=>$sensor->id,'moisture'=>42,'ammonia_status'=>'Safe']);
        $this->assertSame('Incomplete Data',$this->prepare(['monitoring'])['snapshots']['monitoring'][0]['current_condition']);
        SensorReading::create(['farm_id'=>$this->farm->id,'sensor_id'=>$sensor->id,'ammonia'=>10,'ammonia_status'=>'Safe']);
        $this->assertSame('Incomplete Data',$this->prepare(['monitoring'])['snapshots']['monitoring'][0]['current_condition']);
        SensorReading::create(['farm_id'=>$this->farm->id,'sensor_id'=>$sensor->id,'ammonia'=>10,'moisture'=>12,'ammonia_status'=>'Safe','moisture_status'=>'Safe']);
        $this->assertSame('Safe',$this->prepare(['monitoring'])['snapshots']['monitoring'][0]['current_condition']);
        $sensor->update(['last_seen_at'=>now()->subMinutes(10)]);
        $this->assertSame('Offline',$this->prepare(['monitoring'])['snapshots']['monitoring'][0]['current_condition']);
    }
    public function test_all_dates_retains_undated_legacy_rows_without_fabricating_dates(): void
    {
        SensorReading::forceCreate(['farm_id'=>$this->farm->id,'ammonia'=>10,'created_at'=>null]);
        MaintenanceLog::forceCreate(['farm_id'=>$this->farm->id,'maintenance_type'=>'Full Manure Clean-out','performed_at'=>'2026-10-31','photo_path'=>'synthetic','created_at'=>null]);
        $p=$this->prepare(['readings','cleanouts']);
        $this->assertSame(1,$p['streams']['readings']['total']);
        $this->batch($p,'readings')->assertOk()->assertJsonPath('data.items.0.recorded_at',null);
        $p=$this->prepare(['readings','cleanouts'],['date_mode'=>'custom','from'=>'2026-10-31','to'=>'2026-10-31']);
        $this->assertSame(0,$p['streams']['readings']['total']);$this->assertSame(1,$p['streams']['cleanouts']['total']);
    }
}
