<?php

namespace Tests\Feature;

use App\Models\{User,Farm,FarmControlDocument};
use Illuminate\Database\QueryException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB,Http,Mail,Storage};
use Illuminate\Support\Str;
use Tests\Support\Phase104Database;
use Tests\TestCase;

class Phase104ControlDocumentsTest extends TestCase
{
    private bool $transaction=false;
    protected function setUp(): void
    {
        parent::setUp();
        if(getenv('PHASE104_TEST_MARIADB')!=='1') $this->markTestSkipped('Native isolated MariaDB required.');
        Phase104Database::connect(DB::connection()->getDatabaseName());
        DB::beginTransaction(); $this->transaction=true;
        Http::preventStrayRequests(); Http::fake(); Mail::fake();
        config(['filesystems.disks.local.root'=>Phase104Database::settings()['directory'].'/documents-'.Str::uuid(),'filesystems.disks.local.throw'=>true]); Storage::forgetDisk('local');
    }
    protected function tearDown(): void { if($this->transaction) DB::rollBack(); parent::tearDown(); }
    private function owner(): User
    {
        return User::create(['first_name'=>'Native','last_name'=>Str::random(8),'mobile_number'=>'09'.random_int(100000000,999999999),'email'=>Str::uuid().'@example.test','role'=>'farm_owner','status'=>'active','password'=>bcrypt(Str::random(24))]);
    }
    private function farm(User $owner): Farm
    {
        return Farm::create(['user_id'=>$owner->id,'owner_name'=>$owner->full_name,'mobile_number'=>$owner->mobile_number,'farm_name'=>'Native '.Str::random(8),'farm_size'=>'Small','barangay'=>'Calansayan','status'=>'Active']);
    }
    private function pdf(string $name) { return UploadedFile::fake()->createWithContent($name,"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"); }

    public function test_native_upload_access_history_restrict_and_nullable_former_uploader(): void
    {
        $owner=$this->owner(); $other=$this->owner(); $farm=$this->farm($owner); $foreign=$this->farm($other); $snapshot=$owner->full_name; $ids=[];
        foreach(['one.pdf','two.pdf'] as $name) {
            $ids[]=$this->actingAs($owner,'sanctum')->post('/api/farmer/farms/'.$farm->id.'/control-documents',['category'=>'odor_control','document'=>$this->pdf($name)],['Accept'=>'application/json'])->assertCreated()->assertJsonPath('data.uploaded_by',$snapshot)->json('data.id');
        }
        $this->getJson('/api/farms/'.$farm->id.'/control-documents')->assertOk()->assertJsonPath('data.total',2)
            ->assertJsonPath('data.latest.odor_control.id',$ids[1])->assertJsonPath('data.items.1.status','Previous Submission')->assertJsonMissingPath('data.items.0.file_path');
        $this->post('/api/farmer/farms/'.$foreign->id.'/control-documents',['category'=>'odor_control','document'=>$this->pdf('denied.pdf')],['Accept'=>'application/json'])->assertNotFound();
        $this->actingAs($other,'sanctum')->getJson('/api/farms/'.$farm->id.'/control-documents/'.$ids[0].'/file')->assertNotFound();
        $vet=User::where('role','vet')->firstOrFail();
        $this->actingAs($vet,'sanctum')->getJson('/api/farms/'.$farm->id.'/control-documents')->assertForbidden();
        foreach(['admin','super_admin'] as $role) {
            $actor=User::where('role',$role)->firstOrFail();
            $this->actingAs($actor,'sanctum')->getJson('/api/farms/'.$farm->id.'/control-documents')->assertOk()->assertJsonPath('data.items.0.status','On File');
            $this->getJson('/api/farms/'.$farm->id.'/control-documents/'.$ids[0].'/file?download=1')->assertOk()->assertHeader('X-Content-Type-Options','nosniff');
            $this->post('/api/farmer/farms/'.$farm->id.'/control-documents',['category'=>'odor_control','document'=>$this->pdf('denied-role.pdf')],['Accept'=>'application/json'])->assertForbidden();
        }
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/farms/'.$farm->id.'/control-documents')->assertUnauthorized();
        try { $farm->delete(); $this->fail('Document history must restrict farm deletion.'); }
        catch(QueryException $e) { $this->assertSame(1451,(int)$e->errorInfo[1]); }
        $this->assertSame(2,FarmControlDocument::where('farm_id',$farm->id)->count());
        // Synthetic former-owner fixture: retain submissions after ownership
        // has moved, so uploader deletion tests SET NULL without deleting a farm.
        $farm->update(['user_id'=>$other->id]); $owner->delete();
        foreach($ids as $id) { $record=FarmControlDocument::findOrFail($id); $this->assertNull($record->uploaded_by); $this->assertSame($snapshot,$record->uploader_name); }
        $this->actingAs($other,'sanctum')->getJson('/api/farms/'.$farm->id.'/control-documents')->assertOk()->assertJsonPath('data.total',2)->assertJsonPath('data.items.0.uploaded_by',$snapshot);
        $this->assertCount(2,Storage::disk('local')->allFiles());
        $this->assertFalse(DB::connection()->getSchemaBuilder()->hasColumn('sensor_readings','ammonia_adc_mv'));
        Http::assertNothingSent(); Mail::assertNothingSent();
    }
}
