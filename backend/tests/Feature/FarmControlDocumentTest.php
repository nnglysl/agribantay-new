<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\FarmControlDocument;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\PhaseOneDatabase;
use Tests\TestCase;

class FarmControlDocumentTest extends TestCase
{
    private User $owner;
    private Farm $a;
    private Farm $b;
    private Farm $foreign;
    private $migration;

    protected function setUp(): void
    {
        parent::setUp();
        config(['database.connections.phase6' => ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true]]);
        DB::setDefaultConnection('phase6');
        DB::purge('phase6');
        PhaseOneDatabase::create();
        $this->migration = require database_path('migrations/2026_10_31_000000_create_farm_control_documents_table.php');
        $this->migration->up();
        // A fresh temporary root per test; never reset the real private disk.
        config(['filesystems.disks.local.root' => sys_get_temp_dir().'/agribantay-phase6-'.Str::uuid(), 'filesystems.disks.local.throw' => true]);
        Storage::forgetDisk('local');
        Http::preventStrayRequests();
        $this->owner = $this->user('farm_owner');
        $this->a = $this->farm($this->owner, 'Owned A');
        $this->b = $this->farm($this->owner, 'Owned B');
        $this->foreign = $this->farm($this->user('farm_owner'), 'Other Owner');
        $this->actingAs($this->owner, 'sanctum');
    }

    protected function tearDown(): void
    {
        FarmControlDocument::flushEventListeners();
        DB::purge('phase6');
        parent::tearDown();
    }

    private function user(string $role): User
    {
        return User::create(['first_name' => $role, 'last_name' => 'Fixture', 'role' => $role, 'status' => 'active', 'mobile_number' => '09'.random_int(100000000, 999999999)]);
    }

    private function farm(User $owner, string $name): Farm
    {
        return Farm::create(['user_id' => $owner->id, 'farm_name' => $name, 'farm_size' => 'Small', 'status' => 'Active', 'current_status' => 'Safe']);
    }

    private function pdf(string $name = 'control.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    }

    private function upload(?Farm $farm = null, string $category = 'odor_control', ?UploadedFile $file = null)
    {
        return $this->post('/api/farmer/farms/'.($farm ?? $this->a)->id.'/control-documents',
            ['category' => $category, 'document' => $file ?? $this->pdf(), 'remarks' => 'Synthetic submission'], ['Accept' => 'application/json']);
    }

    private function listing(Farm $farm, string $query = '')
    {
        return $this->getJson('/api/farms/'.$farm->id.'/control-documents'.$query);
    }

    private function fileUrl(Farm $farm, int $id): string
    {
        return '/api/farms/'.$farm->id.'/control-documents/'.$id.'/file';
    }

    public function test_odor_and_fly_uploads_are_private_and_do_not_change_farm_status(): void
    {
        $this->owner->update(['first_name' => str_repeat('A', 255), 'last_name' => str_repeat('B', 255)]);
        $before = $this->a->fresh()->getAttributes();
        foreach (['odor_control', 'fly_control'] as $category) {
            $response = $this->upload(category: $category)->assertCreated()->assertJsonPath('data.status', 'On File');
            $doc = FarmControlDocument::findOrFail($response->json('data.id'));
            $this->assertSame($this->a->id, $doc->farm_id);
            $this->assertSame($this->owner->id, $doc->uploaded_by);
            $this->assertSame($this->owner->full_name, $doc->uploader_name);
            $this->assertMatchesRegularExpression('#^farm-control-documents/'.$this->a->id.'/[a-f0-9-]{36}\.pdf$#', $doc->file_path);
            Storage::disk('local')->assertExists($doc->file_path);
            $this->assertArrayNotHasKey('file_path', $response->json('data'));
        }
        $this->assertSame($before, $this->a->fresh()->getAttributes());
        $this->assertSame(0, DB::table('service_requests')->count());
        $this->assertSame(0, DB::table('maintenance_logs')->count());
        Http::assertNothingSent();
    }

    public function test_real_png_content_is_accepted(): void
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVf0AAAAASUVORK5CYII=');
        $this->upload(file: UploadedFile::fake()->createWithContent('photo.PNG', $png))->assertCreated()->assertJsonPath('data.mime_type', 'image/png');
    }

    public function test_all_owned_farms_are_isolated_and_foreign_farms_are_inaccessible(): void
    {
        $a = $this->upload()->assertCreated()->json('data.id');
        $b = $this->upload($this->b, 'fly_control')->assertCreated()->json('data.id');
        $this->listing($this->a)->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.latest.fly_control', null)->assertJsonPath('data.items.0.id', $a);
        $this->listing($this->b)->assertOk()->assertJsonPath('data.latest.odor_control', null)->assertJsonPath('data.items.0.id', $b);
        $this->upload($this->foreign)->assertNotFound();
        $this->listing($this->foreign)->assertNotFound();
        $this->getJson($this->fileUrl($this->b, $a))->assertNotFound();
        $this->actingAs($this->foreign->user, 'sanctum')->getJson($this->fileUrl($this->a, $a))->assertNotFound();
        $this->assertSame(2, FarmControlDocument::count());
    }

    public function test_latest_uses_stable_id_order_and_preserves_every_previous_file(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 31)->setTime(18, 0));
        $first = $this->upload(file: $this->pdf('first.pdf'))->assertCreated()->json('data.id');
        $path = FarmControlDocument::findOrFail($first)->file_path;
        $bytes = Storage::disk('local')->get($path);
        $last = $this->upload(file: $this->pdf('second.pdf'))->assertCreated()->json('data.id');
        $this->listing($this->a)->assertOk()->assertJsonPath('data.latest.odor_control.id', $last)
            ->assertJsonPath('data.items.1.status', 'Previous Submission')->assertJsonPath('data.items.1.original_name', 'first.pdf')
            ->assertJsonPath('data.items.0.uploaded_at', 'Nov 01, 2026 2:00 AM');
        $this->assertSame($bytes, Storage::disk('local')->get($path));
        $this->getJson($this->fileUrl($this->a, $first))->assertOk();
        $this->assertCount(2, Storage::disk('local')->allFiles());
        $this->travelBack();
    }

    public function test_history_is_server_paged_and_latest_survives_page_and_category_changes(): void
    {
        for ($i = 0; $i < 12; $i++) $this->upload(category: $i % 2 ? 'fly_control' : 'odor_control')->assertCreated();
        $this->listing($this->a, '?page=2&per_page=5&query_key=fixture')->assertOk()->assertJsonPath('data.page', 2)
            ->assertJsonPath('data.total', 12)->assertJsonCount(5, 'data.items')->assertJsonPath('data.query_key', 'fixture')
            ->assertJsonPath('data.latest.fly_control.id', 12);
        $this->listing($this->a, '?category=odor_control&page=999&per_page=5')->assertOk()->assertJsonPath('data.page', 2)->assertJsonPath('data.total', 6)->assertJsonCount(1, 'data.items');
        $this->listing($this->a, '?per_page=101')->assertUnprocessable();
    }

    public static function viewers(): array { return [['admin'], ['super_admin'], ['farm_owner']]; }

    #[DataProvider('viewers')]
    public function test_authorized_users_view_and_download_without_modifying_documents(string $role): void
    {
        $id = $this->upload()->assertCreated()->json('data.id');
        $this->actingAs($role === 'farm_owner' ? $this->owner : $this->user($role), 'sanctum');
        $this->listing($this->a)->assertOk()->assertJsonPath('data.latest.odor_control.id', $id);
        $this->getJson($this->fileUrl($this->a, $id))->assertOk()->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Content-Disposition', 'inline; filename="control.pdf"');
        $this->getJson($this->fileUrl($this->a, $id).'?download=1')->assertOk()->assertHeader('Content-Disposition', 'attachment; filename="control.pdf"');
        foreach (['patch', 'put', 'delete'] as $method) $this->{$method.'Json'}($this->fileUrl($this->a, $id))->assertStatus(405);
        $this->assertSame(1, FarmControlDocument::count());
        if ($role !== 'farm_owner') $this->upload()->assertForbidden();
    }

    public function test_vet_and_unknown_roles_cannot_list_or_download_and_inactive_owner_loses_access(): void
    {
        $id = $this->upload()->assertCreated()->json('data.id');
        foreach (['vet', 'unknown'] as $role) {
            $this->actingAs($this->user($role), 'sanctum');
            $this->listing($this->a)->assertForbidden();
            $this->getJson($this->fileUrl($this->a, $id))->assertForbidden();
            $this->upload()->assertForbidden();
        }
        $this->owner->update(['status' => 'inactive']);
        $this->actingAs($this->owner, 'sanctum');
        $this->listing($this->a)->assertUnauthorized();
    }

    public function test_unauthenticated_requests_cannot_access_any_document_route(): void
    {
        auth()->forgetGuards();
        $this->app['auth']->forgetGuards();
        $this->listing($this->a)->assertUnauthorized();
        $this->getJson($this->fileUrl($this->a, 1))->assertUnauthorized();
        $this->postJson('/api/farmer/farms/'.$this->a->id.'/control-documents')->assertUnauthorized();
    }

    public static function invalidFiles(): array
    {
        return [['malware.pdf', '<script>alert(1)</script>'], ['disguised.png', '%PDF-1.4 fake'], ['unsafe.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'], ['file.php', '%PDF-1.4 fake'], ['empty.pdf', '']];
    }

    #[DataProvider('invalidFiles')]
    public function test_rejects_invalid_content_extensions_and_empty_files(string $name, string $content): void
    {
        $this->upload(file: UploadedFile::fake()->createWithContent($name, $content))->assertUnprocessable();
        $this->assertSame(0, FarmControlDocument::count());
        $this->assertCount(0, Storage::disk('local')->allFiles());
    }

    public function test_configured_size_missing_file_and_invalid_fields_are_rejected_before_storage(): void
    {
        config(['control_documents.max_kb' => 1]);
        $this->upload(file: UploadedFile::fake()->createWithContent('large.pdf', '%PDF-1.4'.str_repeat('x', 2048)))->assertUnprocessable();
        $url = '/api/farmer/farms/'.$this->a->id.'/control-documents';
        $this->postJson($url, ['category' => 'odor_control'])->assertUnprocessable()->assertJsonValidationErrors('document');
        $this->post($url, ['category' => 'approved', 'document' => $this->pdf()], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post($url, ['category' => 'fly_control', 'document' => $this->pdf(), 'farm_id' => $this->foreign->id], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertSame(0, FarmControlDocument::count());
        $this->assertCount(0, Storage::disk('local')->allFiles());
    }

    public function test_empty_listing_and_missing_migration_have_explicit_states(): void
    {
        $this->listing($this->a)->assertOk()->assertJsonPath('data.total', 0)->assertJsonPath('data.latest.odor_control', null)->assertJsonPath('data.latest.fly_control', null);
        $this->migration->down(); // Only the empty, private in-memory table.
        $this->listing($this->a)->assertStatus(503)->assertJsonPath('message', 'Control Documents are not available yet. Please contact system support.');
        $this->upload()->assertStatus(503);
    }

    public function test_failed_database_write_removes_only_its_new_file(): void
    {
        $this->upload()->assertCreated();
        $old = FarmControlDocument::firstOrFail();
        FarmControlDocument::creating(fn () => throw new \RuntimeException('Synthetic database failure'));
        $this->upload()->assertStatus(503)->assertJsonPath('message', 'The document could not be saved. Please try again.');
        $this->assertSame(1, FarmControlDocument::count());
        $this->assertSame([$old->file_path], Storage::disk('local')->allFiles());
    }

    public function test_missing_or_unsafe_stored_paths_are_not_served(): void
    {
        $id = $this->upload()->assertCreated()->json('data.id');
        $doc = FarmControlDocument::findOrFail($id);
        $doc->update(['file_path' => '../outside.pdf']);
        $this->getJson($this->fileUrl($this->a, $id))->assertNotFound();
        $doc->update(['file_path' => 'farm-control-documents/'.$this->a->id.'/'.Str::uuid().'.pdf']);
        $this->getJson($this->fileUrl($this->a, $id))->assertNotFound();
    }

    public function test_populated_history_cannot_be_rolled_back_or_cascade_deleted(): void
    {
        $this->upload()->assertCreated();
        try { $this->migration->down(); $this->fail('Populated history must be retained.'); }
        catch (\RuntimeException $error) { $this->assertSame('Cannot roll back populated farm control document history.', $error->getMessage()); }
        try { $this->a->delete(); $this->fail('Farm deletion must not cascade through submissions.'); }
        catch (\Illuminate\Database\QueryException $error) { $this->assertSame(1, FarmControlDocument::count()); }
        $this->assertFalse(Schema::hasColumn('farm_control_documents', 'status'));
    }
}
