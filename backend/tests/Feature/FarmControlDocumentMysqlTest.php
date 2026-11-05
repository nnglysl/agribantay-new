<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\FarmControlDocument;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Native-engine smoke test, invoked only against a newly created schema fixture. */
class FarmControlDocumentMysqlTest extends TestCase
{
    public function test_named_migration_and_document_workflow_on_private_mysql(): void
    {
        if (getenv('PHASE6_TEST_MYSQL') !== '1') {
            $this->markTestSkipped('Explicit private MySQL fixture required.');
        }
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.mysql.host'), ['localhost', '127.0.0.1', '::1']);
        $this->assertFalse(Schema::hasTable('farm_control_documents'), 'Use a new schema-only fixture for this test.');
        Http::preventStrayRequests();
        config(['filesystems.disks.local.root' => sys_get_temp_dir().'/agribantay-phase6-mysql-'.Str::uuid(), 'filesystems.disks.local.throw' => true]);
        Storage::forgetDisk('local');
        $migration = require database_path('migrations/2026_10_31_000000_create_farm_control_documents_table.php');
        $migration->up(); // Only this verified private database; never artisan migrate.
        $this->assertFalse(Schema::hasColumn('sensor_readings', 'ammonia_adc_mv'), 'Optional telemetry remains separate.');
        $rules = DB::table('information_schema.REFERENTIAL_CONSTRAINTS')
            ->where('CONSTRAINT_SCHEMA', DB::connection()->getDatabaseName())->where('TABLE_NAME', 'farm_control_documents')
            ->pluck('DELETE_RULE', 'REFERENCED_TABLE_NAME')->all();
        $this->assertSame('RESTRICT', $rules['farms']);
        $this->assertSame('SET NULL', $rules['users']);
        $indexes = DB::table('information_schema.STATISTICS')->where('TABLE_SCHEMA', DB::connection()->getDatabaseName())
            ->where('TABLE_NAME', 'farm_control_documents')->orderBy('INDEX_NAME')->orderBy('SEQ_IN_INDEX')->get();
        $this->assertCount(1, $indexes->where('INDEX_NAME', 'farm_control_documents_file_path_unique'));
        $this->assertTrue($indexes->where('INDEX_NAME', 'farm_control_documents_file_path_unique')->every(fn ($index) => (int) $index->NON_UNIQUE === 0));
        $this->assertSame(['farm_id', 'category', 'id'], $indexes->where('INDEX_NAME', 'farm_control_documents_farm_id_category_id_index')->pluck('COLUMN_NAME')->values()->all());
        $farm = Farm::firstOrFail();
        $before = $farm->getAttributes();
        $farm->user->update(['first_name' => str_repeat('A', 255), 'last_name' => str_repeat('B', 255)]);
        $this->actingAs($farm->user, 'sanctum');
        $ids = [];
        foreach (['first.pdf', 'second.pdf'] as $name) {
            $file = UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
            $ids[] = $this->post('/api/farmer/farms/'.$farm->id.'/control-documents', ['category' => 'odor_control', 'document' => $file], ['Accept' => 'application/json'])
                ->assertCreated()->assertJsonPath('data.uploaded_by', $farm->user->full_name)->json('data.id');
        }
        $this->getJson('/api/farms/'.$farm->id.'/control-documents?per_page=1&page=2')->assertOk()
            ->assertJsonPath('data.latest.odor_control.id', $ids[1])->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.items.0.status', 'Previous Submission');
        $this->actingAs(User::where('role', 'admin')->firstOrFail(), 'sanctum')
            ->getJson('/api/farms/'.$farm->id.'/control-documents/'.$ids[0].'/file?download=1')->assertOk();
        $this->assertEquals($before, $farm->fresh()->getAttributes());
        $this->assertCount(2, Storage::disk('local')->allFiles());
        try {
            $farm->delete();
            $this->fail('History must not cascade on farm deletion.');
        } catch (QueryException $error) {
            $this->assertSame(2, FarmControlDocument::count());
        }
        Http::assertNothingSent();
    }
}
