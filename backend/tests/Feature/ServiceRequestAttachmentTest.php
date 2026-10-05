<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\ServiceRequest;
use App\Models\ServiceRequestAttachment;
use App\Models\User;
use App\Support\ServiceTypes;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Farm Biosecurity service type + the accomplished-form attachment a Vet
 * uploads when completing a request.
 *
 * Same MySQL-only caveat as ServiceRequestWorkflowTest; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ServiceRequestAttachmentTest
 */
class ServiceRequestAttachmentTest extends TestCase
{
    use DatabaseTransactions;

    private User $vet1;
    private User $vet2;
    private User $staff;
    private User $superAdmin;
    private User $farmer;
    private User $otherFarmer;
    private Farm $farm;
    private Farm $otherFarm;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ServiceRequestAttachmentTest');
        }

        Http::fake();
        Storage::fake(ServiceRequestAttachment::DISK);

        $this->vet1       = $this->user('vet');
        $this->vet2       = $this->user('vet');
        $this->staff      = $this->user('admin');
        $this->superAdmin = User::where('role', 'super_admin')->firstOrFail();
        $this->farmer      = $this->user('farm_owner');
        $this->otherFarmer = $this->user('farm_owner');
        $this->farm      = $this->farmFor($this->farmer);
        $this->otherFarm = $this->farmFor($this->otherFarmer);
    }

    private function user(string $role): User
    {
        return User::create([
            'first_name' => ucfirst($role), 'last_name' => Str::random(6),
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'email' => Str::random(10) . '@attach.test',
            'password' => bcrypt('x'), 'role' => $role, 'status' => 'active',
        ]);
    }

    private function farmFor(User $owner): Farm
    {
        return Farm::create([
            'user_id' => $owner->id, 'farm_name' => 'Attach Farm ' . Str::random(4), 'owner_name' => $owner->full_name,
            'mobile_number' => $owner->mobile_number, 'barangay' => 'Aya', 'address' => 'x',
            'farm_size' => 'Small', 'status' => 'Active',
        ]);
    }

    /** A Scheduled request accepted by vet1 (the only one who may complete it). */
    private function scheduled(string $type = ServiceTypes::FARM_BIOSECURITY, array $extra = []): ServiceRequest
    {
        return ServiceRequest::create(array_merge([
            'request_number' => 'SR-A' . random_int(10000, 99999),
            'farm_id'        => $this->farm->id,
            'requested_by'   => $this->farmer->id,
            'service_type'   => $type,
            'notes'          => 'Farmer notes',
            'status'         => 'Scheduled',
            'priority'       => 'Medium',
            'accepted_by'    => $this->vet1->id,
            'scheduled_at'   => now()->subDay(),
        ], $extra));
    }

    private function pdf(string $name = 'biosecurity-form.pdf', int $kb = 120): UploadedFile
    {
        return UploadedFile::fake()->create($name, $kb, 'application/pdf');
    }

    /**
     * A real (non-fake) upload whose MIME type is sniffed from its bytes, the
     * way a browser upload is — the fake factory reports the MIME it is told
     * or infers it from the name, which is exactly what must not be trusted.
     */
    private function realUpload(string $name, string $bytes): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'agb');
        file_put_contents($path, $bytes);
        return new UploadedFile($path, $name, null, null, true);
    }

    private const PNG_1PX  = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    private const JPEG_1PX = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    private function complete(User $as, ServiceRequest $sr, array $data)
    {
        return $this->actingAs($as)->post("/api/vet/vaccination-requests/{$sr->id}/complete", $data, ['Accept' => 'application/json']);
    }

    private function assertStillScheduledWithoutAttachment(ServiceRequest $sr): void
    {
        $sr->refresh();
        $this->assertSame('Scheduled', $sr->status);
        $this->assertNull($sr->completed_at);
        $this->assertSame(0, ServiceRequestAttachment::where('service_request_id', $sr->id)->count());
        $this->assertCount(0, Storage::disk(ServiceRequestAttachment::DISK)->allFiles());
    }

    // ---------------------------------------------------------------- uploads

    public function test_pdf_upload_completes_farm_biosecurity_request_and_links_the_file(): void
    {
        $sr = $this->scheduled();

        $res = $this->complete($this->vet1, $sr, ['completion_notes' => 'Footbaths installed; recommended fencing.', 'attachment' => $this->pdf()]);
        $res->assertOk()->assertJsonPath('data.status', 'Completed')->assertJsonPath('data.attachment.original_name', 'biosecurity-form.pdf');

        $sr->refresh();
        $this->assertSame('Completed', $sr->status);
        $this->assertNotNull($sr->completed_at);
        $this->assertSame('Footbaths installed; recommended fencing.', $sr->completion_notes);
        $this->assertSame('Farmer notes', $sr->notes, 'the farmer\'s original notes are untouched');

        $att = ServiceRequestAttachment::where('service_request_id', $sr->id)->firstOrFail();
        $this->assertSame('application/pdf', $att->mime_type);
        $this->assertSame($this->vet1->id, $att->uploaded_by);
        $this->assertStringStartsWith("service-request-attachments/{$sr->id}/", $att->file_path);
        $this->assertStringEndsWith('.pdf', $att->file_path);
        $this->assertStringNotContainsString('biosecurity-form', $att->file_path, 'stored name is generated, not the client name');
        Storage::disk(ServiceRequestAttachment::DISK)->assertExists($att->file_path);
    }

    public function test_jpg_and_png_uploads_are_accepted(): void
    {
        foreach ([['form.jpg', 'image/jpeg', self::JPEG_1PX], ['form.jpeg', 'image/jpeg', self::JPEG_1PX], ['form.png', 'image/png', self::PNG_1PX]] as [$name, $mime, $b64]) {
            $sr = $this->scheduled();
            $file = $this->realUpload($name, base64_decode($b64));
            $this->complete($this->vet1, $sr, ['completion_notes' => 'Photo of the accomplished form.', 'attachment' => $file])
                ->assertOk()->assertJsonPath('data.attachment.mime_type', $mime);
            $this->assertSame('Completed', $sr->fresh()->status);
        }
    }

    public function test_unsupported_file_types_are_rejected_and_nothing_is_stored(): void
    {
        foreach ([
            UploadedFile::fake()->create('form.exe', 10, 'application/x-msdownload'),
            UploadedFile::fake()->create('form.txt', 10, 'text/plain'),
            UploadedFile::fake()->create('form.gif', 10, 'image/gif'),
            // Real uploads sniffed from their bytes: a PHP script disguised as a
            // PDF, and a PNG renamed to .pdf (extension and content disagree).
            $this->realUpload('form.pdf', "<?php echo 'x';"),
            $this->realUpload('form.pdf', base64_decode(self::PNG_1PX)),
            $this->realUpload('form.php', '%PDF-1.4 fake'),
        ] as $bad) {
            $sr = $this->scheduled();
            $res = $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachment' => $bad])->assertStatus(422);
            $this->assertNotEmpty(array_intersect(['attachment', 'attachments.0'], array_keys($res->json('errors'))), 'error is reported against the file field');
            $this->assertStillScheduledWithoutAttachment($sr);

            // Same file through the multi-file field, mixed with a valid one:
            // the whole submission is refused and neither file is stored.
            $sr2 = $this->scheduled();
            $this->complete($this->vet1, $sr2, ['completion_notes' => 'n', 'attachments' => [$this->pdf('ok.pdf'), $bad]])->assertStatus(422);
            $this->assertStillScheduledWithoutAttachment($sr2);
        }
    }

    public function test_oversized_file_is_rejected(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf('big.pdf', 5121)])
            ->assertStatus(422)->assertJsonValidationErrors(['attachment']);
        $this->assertStillScheduledWithoutAttachment($sr);

        // Exactly at the limit is fine.
        $sr2 = $this->scheduled();
        $this->complete($this->vet1, $sr2, ['completion_notes' => 'n', 'attachment' => $this->pdf('max.pdf', 5120)])->assertOk();
    }

    public function test_missing_attachment_blocks_a_farm_biosecurity_completion(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'Visited the farm.'])
            ->assertStatus(422)->assertJsonValidationErrors(['attachments'])
            ->assertJsonFragment(['message' => 'Please attach the accomplished Farm Biosecurity form before completing this request.']);
        $this->assertStillScheduledWithoutAttachment($sr);
        $this->assertNull($sr->fresh()->completion_notes, 'nothing is written on a rejected completion');
    }

    public function test_missing_notes_is_still_rejected_even_with_a_valid_file(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['attachment' => $this->pdf()])
            ->assertStatus(422)->assertJsonValidationErrors(['completion_notes']);
        $this->assertStillScheduledWithoutAttachment($sr);
    }

    public function test_attachment_is_optional_for_blood_test_and_legacy_vaccine_completions(): void
    {
        $blood = $this->scheduled(ServiceTypes::BLOOD_TEST);
        $this->complete($this->vet1, $blood, ['completion_notes' => 'Samples collected.'])->assertOk();
        $this->assertSame('Completed', $blood->fresh()->status);
        $this->assertNull($blood->fresh()->attachment);

        // The old JSON PATCH path used by the existing workflow tests keeps working.
        $legacy = $this->scheduled(ServiceTypes::VACCINE_LEGACY);
        $this->actingAs($this->vet1)->patchJson("/api/vet/vaccination-requests/{$legacy->id}/complete", ['completion_notes' => 'Administered.'])->assertOk();
        $this->assertSame('Completed', $legacy->fresh()->status);

        // And a Blood Test may still carry a form if the Vet has one.
        $withFile = $this->scheduled(ServiceTypes::BLOOD_TEST);
        $this->complete($this->vet1, $withFile, ['completion_notes' => 'n', 'attachment' => $this->pdf()])->assertOk();
        $this->assertNotNull($withFile->fresh()->attachment);
    }

    // ---------------------------------------------------------- authorization

    public function test_only_the_accepting_vet_can_complete_and_upload(): void
    {
        $sr = $this->scheduled();

        $this->complete($this->vet2, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf()])->assertStatus(403);
        $this->assertStillScheduledWithoutAttachment($sr);

        $this->complete($this->staff, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf()])->assertStatus(403);
        $this->complete($this->farmer, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf()])->assertStatus(403);
        $this->assertStillScheduledWithoutAttachment($sr);

        // Super Admin keeps the existing API-level override.
        $this->complete($this->superAdmin, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf()])->assertOk();
    }

    public function test_only_scheduled_requests_can_be_completed_with_a_file(): void
    {
        foreach (['Pending', 'Completed', 'Cancelled'] as $status) {
            $sr = $this->scheduled(ServiceTypes::FARM_BIOSECURITY, ['status' => $status, 'accepted_by' => $status === 'Pending' ? null : $this->vet1->id]);
            $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf()])->assertStatus(422);
            $this->assertSame($status, $sr->fresh()->status);
            $this->assertSame(0, ServiceRequestAttachment::where('service_request_id', $sr->id)->count());
        }
        $this->assertCount(0, Storage::disk(ServiceRequestAttachment::DISK)->allFiles(), 'no orphaned files');
    }

    public function test_attachment_is_linked_only_to_the_completed_request(): void
    {
        $a = $this->scheduled();
        $b = $this->scheduled();

        $this->complete($this->vet1, $a, ['completion_notes' => 'n', 'attachment' => $this->pdf('a.pdf')])->assertOk();

        $this->assertSame(1, ServiceRequestAttachment::where('service_request_id', $a->id)->count());
        $this->assertSame(0, ServiceRequestAttachment::where('service_request_id', $b->id)->count());
        $this->assertSame('Scheduled', $b->fresh()->status);
    }

    public function test_recompleting_after_undo_keeps_existing_files_and_appends_new_ones(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'first', 'attachment' => $this->pdf('first.pdf')])->assertOk();
        $old = ServiceRequestAttachment::where('service_request_id', $sr->id)->firstOrFail();

        $this->actingAs($this->vet1)->patchJson("/api/vet/vaccination-requests/{$sr->id}/reopen")->assertOk();

        // Re-completing without a new file is allowed: the form is already on file.
        $this->complete($this->vet1, $sr, ['completion_notes' => 'second'])->assertOk();
        $this->assertSame('Completed', $sr->fresh()->status);
        $this->assertSame(1, ServiceRequestAttachment::where('service_request_id', $sr->id)->count());

        $this->actingAs($this->vet1)->patchJson("/api/vet/vaccination-requests/{$sr->id}/reopen")->assertOk();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'third', 'attachments' => [$this->pdf('page2.pdf'), $this->pdf('page3.pdf')]])->assertOk()
            ->assertJsonPath('data.attachment_count', 3);

        $names = ServiceRequestAttachment::where('service_request_id', $sr->id)->orderBy('id')->pluck('original_name')->all();
        $this->assertSame(['first.pdf', 'page2.pdf', 'page3.pdf'], $names, 'nothing was replaced; new files were appended');
        Storage::disk(ServiceRequestAttachment::DISK)->assertExists($old->file_path);
        $this->assertCount(3, Storage::disk(ServiceRequestAttachment::DISK)->allFiles());
    }

    public function test_recompleting_cannot_push_the_total_past_five(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => $this->pdfs(4)])->assertOk();
        $this->actingAs($this->vet1)->patchJson("/api/vet/vaccination-requests/{$sr->id}/reopen")->assertOk();

        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => $this->pdfs(2)])
            ->assertStatus(422)->assertJsonFragment(['message' => 'A request can have at most 5 attachments. 4 already on file, so you can add 1 more.']);
        $this->assertSame('Scheduled', $sr->fresh()->status);
        $this->assertSame(4, ServiceRequestAttachment::where('service_request_id', $sr->id)->count());
        $this->assertCount(4, Storage::disk(ServiceRequestAttachment::DISK)->allFiles(), 'the rejected files were not written');

        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => $this->pdfs(1)])->assertOk()->assertJsonPath('data.attachment_count', 5);
    }

    public function test_owner_can_remove_an_attachment_only_while_the_request_is_reopened(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => $this->pdfs(2)])->assertOk();
        [$a, $b] = ServiceRequestAttachment::where('service_request_id', $sr->id)->orderBy('id')->get()->all();
        $url = fn ($att) => "/api/vet/vaccination-requests/{$sr->id}/attachments/{$att->id}";

        // Completed records are immutable.
        $this->actingAs($this->vet1)->deleteJson($url($a))->assertStatus(422);

        $this->actingAs($this->vet1)->patchJson("/api/vet/vaccination-requests/{$sr->id}/reopen")->assertOk();

        // Another Vet, Staff and the farmer are refused; a foreign id is a 404.
        $this->actingAs($this->vet2)->deleteJson($url($a))->assertStatus(403);
        $this->actingAs($this->staff)->deleteJson($url($a))->assertStatus(403);
        $this->actingAs($this->farmer)->deleteJson($url($a))->assertStatus(403);
        $other = $this->scheduled();
        $this->complete($this->vet1, $other, ['completion_notes' => 'n', 'attachment' => $this->pdf('other.pdf')])->assertOk();
        $foreign = ServiceRequestAttachment::where('service_request_id', $other->id)->firstOrFail();
        $this->actingAs($this->vet1)->deleteJson($url($foreign))->assertStatus(404);
        $this->assertSame(1, ServiceRequestAttachment::where('service_request_id', $other->id)->count());

        $this->actingAs($this->vet1)->deleteJson($url($a))->assertOk()->assertJsonPath('data.attachment_count', 1);
        $this->assertNull(ServiceRequestAttachment::find($a->id));
        Storage::disk(ServiceRequestAttachment::DISK)->assertMissing($a->file_path);
        Storage::disk(ServiceRequestAttachment::DISK)->assertExists($b->file_path);

        // The freed slot can be used again, still capped at five overall.
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => $this->pdfs(4)])->assertOk()->assertJsonPath('data.attachment_count', 5);
    }

    public function test_a_second_submission_does_not_create_a_second_attachment(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf('one.pdf')])->assertOk();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'again', 'attachment' => $this->pdf('two.pdf')])->assertStatus(422);

        $this->assertSame(1, ServiceRequestAttachment::where('service_request_id', $sr->id)->count());
        $this->assertSame('n', $sr->fresh()->completion_notes);
        $this->assertCount(1, Storage::disk(ServiceRequestAttachment::DISK)->allFiles(), 'the duplicate upload was discarded');
    }

    // ------------------------------------------------------- multiple files

    /** N distinct valid PDFs. */
    private function pdfs(int $n, string $prefix = 'page'): array
    {
        return array_map(fn ($i) => $this->pdf("{$prefix}-{$i}.pdf", 50 + $i), range(1, $n));
    }

    public function test_one_to_five_attachments_are_accepted_and_all_linked(): void
    {
        foreach ([1, 2, 3, 4, 5] as $n) {
            $sr = $this->scheduled();
            $this->complete($this->vet1, $sr, ['completion_notes' => "with {$n}", 'attachments' => $this->pdfs($n)])
                ->assertOk()->assertJsonPath('data.status', 'Completed')->assertJsonPath('data.attachment_count', $n)->assertJsonPath('data.attachment_max', 5);
            $rows = ServiceRequestAttachment::where('service_request_id', $sr->id)->orderBy('id')->get();
            $this->assertCount($n, $rows);
            $this->assertSame(array_map(fn ($i) => "page-{$i}.pdf", range(1, $n)), $rows->pluck('original_name')->all());
            foreach ($rows as $row) {
                $this->assertSame($this->vet1->id, $row->uploaded_by);
                Storage::disk(ServiceRequestAttachment::DISK)->assertExists($row->file_path);
            }
            $this->assertSame("with {$n}", $sr->fresh()->completion_notes);
        }
    }

    public function test_a_sixth_attachment_is_rejected_and_nothing_is_stored(): void
    {
        $sr = $this->scheduled();
        $before = count(Storage::disk(ServiceRequestAttachment::DISK)->allFiles());
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => $this->pdfs(6)])
            ->assertStatus(422)->assertJsonValidationErrors(['attachments'])
            ->assertJsonFragment(['attachments' => ['You can attach up to 5 files per request.']]);
        $this->assertStillScheduledWithoutAttachment($sr);
        $this->assertCount($before, Storage::disk(ServiceRequestAttachment::DISK)->allFiles());

        // Five under attachments[] plus one under the legacy field is six too.
        $sr2 = $this->scheduled();
        $this->complete($this->vet1, $sr2, ['completion_notes' => 'n', 'attachments' => $this->pdfs(5), 'attachment' => $this->pdf('six.pdf')])
            ->assertStatus(422)->assertJsonValidationErrors(['attachments']);
        $this->assertStillScheduledWithoutAttachment($sr2);
    }

    public function test_mixed_pdf_and_image_attachments_are_accepted(): void
    {
        $sr = $this->scheduled();
        $files = [
            $this->realUpload('page-1.jpg', base64_decode(self::JPEG_1PX)),
            $this->realUpload('page-2.jpeg', base64_decode(self::JPEG_1PX)),
            $this->realUpload('page-3.png', base64_decode(self::PNG_1PX)),
            $this->pdf('summary.pdf'),
            $this->realUpload('farm.jpg', base64_decode(self::JPEG_1PX)),
        ];
        $res = $this->complete($this->vet1, $sr, ['completion_notes' => 'three pages + extras', 'attachments' => $files])->assertOk();
        $this->assertSame(['image/jpeg', 'image/jpeg', 'image/png', 'application/pdf', 'image/jpeg'], array_column($res->json('data.attachments'), 'mime_type'));
        $paths = ServiceRequestAttachment::where('service_request_id', $sr->id)->orderBy('id')->pluck('file_path')->all();
        $this->assertMatchesRegularExpression('/\.jpg$/', $paths[0]);
        $this->assertMatchesRegularExpression('/\.jpg$/', $paths[1], 'stored extension follows the bytes, not the .jpeg name');
        $this->assertMatchesRegularExpression('/\.png$/', $paths[2]);
        $this->assertMatchesRegularExpression('/\.pdf$/', $paths[3]);
    }

    public function test_one_oversized_file_in_a_batch_rejects_the_whole_batch(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => [$this->pdf('a.pdf'), $this->pdf('big.pdf', 5121), $this->pdf('c.pdf')]])
            ->assertStatus(422)->assertJsonValidationErrors(['attachments.1']);
        $this->assertStillScheduledWithoutAttachment($sr);
    }

    public function test_multi_file_completion_is_refused_for_the_wrong_vet_and_stores_nothing(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet2, $sr, ['completion_notes' => 'n', 'attachments' => $this->pdfs(3)])->assertStatus(403);
        $this->assertStillScheduledWithoutAttachment($sr);
    }

    public function test_duplicate_multi_file_submission_is_a_no_op(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'first', 'attachments' => $this->pdfs(3)])->assertOk();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'again', 'attachments' => $this->pdfs(2, 'dup')])->assertStatus(422);
        $this->assertSame(3, ServiceRequestAttachment::where('service_request_id', $sr->id)->count());
        $this->assertSame('first', $sr->fresh()->completion_notes);
        $this->assertCount(3, Storage::disk(ServiceRequestAttachment::DISK)->allFiles(), 'the duplicate batch was discarded');
    }

    public function test_each_attachment_is_downloadable_by_id_and_scoped_to_its_request(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => [$this->pdf('p1.pdf'), $this->realUpload('p2.png', base64_decode(self::PNG_1PX))]])->assertOk();
        [$a, $b] = ServiceRequestAttachment::where('service_request_id', $sr->id)->orderBy('id')->get()->all();

        $r1 = $this->actingAs($this->farmer)->get("/api/service-requests/{$sr->id}/attachments/{$a->id}")->assertOk();
        $this->assertSame('application/pdf', $r1->headers->get('Content-Type'));
        $r2 = $this->actingAs($this->superAdmin)->get("/api/service-requests/{$sr->id}/attachments/{$b->id}?download=1")->assertOk();
        $this->assertSame('image/png', $r2->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment; filename="p2.png"', $r2->headers->get('Content-Disposition'));

        // Legacy single-file route still answers with the most recent file.
        $r3 = $this->actingAs($this->vet2)->get("/api/service-requests/{$sr->id}/attachment")->assertOk();
        $this->assertSame('image/png', $r3->headers->get('Content-Type'));

        // Another request's id under this request, and other roles, are refused.
        $other = $this->scheduled();
        $this->complete($this->vet1, $other, ['completion_notes' => 'n', 'attachment' => $this->pdf('o.pdf')])->assertOk();
        $foreign = ServiceRequestAttachment::where('service_request_id', $other->id)->firstOrFail();
        $this->actingAs($this->vet1)->get("/api/service-requests/{$sr->id}/attachments/{$foreign->id}")->assertStatus(404);
        $this->actingAs($this->otherFarmer)->get("/api/service-requests/{$sr->id}/attachments/{$a->id}")->assertStatus(403);
        $this->actingAs($this->staff)->get("/api/service-requests/{$sr->id}/attachments/{$a->id}")->assertStatus(403);
    }

    public function test_lists_carry_the_full_attachment_list_and_the_legacy_single_field(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachments' => $this->pdfs(3)])->assertOk();

        $vetRow = collect($this->actingAs($this->vet2)->getJson('/api/vet/vaccination-requests')->assertOk()->json('data.completed'))->firstWhere('id', $sr->id);
        $this->assertCount(3, $vetRow['attachments']);
        $this->assertSame(3, $vetRow['attachment_count']);
        $this->assertSame('page-3.pdf', $vetRow['attachment']['original_name'], 'legacy field = most recent');

        $saRow = collect($this->actingAs($this->superAdmin)->getJson('/api/admin/service-requests')->assertOk()->json('data'))->firstWhere('id', $sr->id);
        $this->assertSame(['page-1.pdf', 'page-2.pdf', 'page-3.pdf'], array_column($saRow['attachments'], 'original_name'));

        $farmerRow = collect($this->actingAs($this->farmer)->getJson("/api/farmer/service-requests?farm_id={$this->farm->id}")->assertOk()->json('data.past'))->firstWhere('id', $sr->id);
        $this->assertCount(3, $farmerRow['attachments']);

        $farmRow = collect($this->actingAs($this->vet1)->getJson("/api/vet/farms/{$this->farm->id}/service-requests")->assertOk()->json('data.requests'))->firstWhere('id', $sr->id);
        $this->assertCount(3, $farmRow['attachments']);
    }

    public function test_requests_completed_with_a_single_attachment_before_this_change_still_read_correctly(): void
    {
        // A pre-existing one-file completion: one row, created the old way.
        $sr = $this->scheduled(ServiceTypes::FARM_BIOSECURITY, ['status' => 'Completed', 'completed_at' => now()->subWeek(), 'completion_notes' => 'old']);
        Storage::disk(ServiceRequestAttachment::DISK)->put("service-request-attachments/{$sr->id}/legacy.pdf", '%PDF-1.4 legacy');
        $legacy = ServiceRequestAttachment::create([
            'service_request_id' => $sr->id, 'uploaded_by' => $this->vet1->id, 'original_name' => 'legacy.pdf',
            'file_path' => "service-request-attachments/{$sr->id}/legacy.pdf", 'mime_type' => 'application/pdf', 'file_size' => 15,
        ]);

        $row = collect($this->actingAs($this->vet1)->getJson('/api/vet/vaccination-requests')->json('data.completed'))->firstWhere('id', $sr->id);
        $this->assertSame([$legacy->id], array_column($row['attachments'], 'id'));
        $this->assertSame('legacy.pdf', $row['attachment']['original_name']);
        $this->actingAs($this->farmer)->get("/api/service-requests/{$sr->id}/attachments/{$legacy->id}")->assertOk();
        $this->actingAs($this->farmer)->get("/api/service-requests/{$sr->id}/attachment")->assertOk();
    }

    // ---------------------------------------------------------------- download

    public function test_attachment_download_is_limited_to_permitted_users(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf()])->assertOk();
        $url = "/api/service-requests/{$sr->id}/attachment";

        foreach ([$this->vet1, $this->vet2, $this->superAdmin, $this->farmer] as $allowed) {
            $res = $this->actingAs($allowed)->get($url);
            $res->assertOk();
            $this->assertSame('application/pdf', $res->headers->get('Content-Type'));
            $this->assertStringContainsString('inline', $res->headers->get('Content-Disposition'));
        }
        $this->actingAs($this->farmer)->get($url . '?download=1')->assertOk()->assertHeader('Content-Disposition', 'attachment; filename="biosecurity-form.pdf"');

        // Another farmer, and Staff (Vet-only type), are refused.
        $this->actingAs($this->otherFarmer)->get($url)->assertStatus(403);
        $this->actingAs($this->staff)->get($url)->assertStatus(403);
        $this->assertContains($this->get($url, ['Accept' => 'application/json'])->status(), [401, 403], 'guests are refused');

        // A request without a form.
        $bare = $this->scheduled();
        $this->actingAs($this->vet1)->get("/api/service-requests/{$bare->id}/attachment")->assertStatus(404);
    }

    public function test_lists_expose_the_attachment_summary_to_each_role(): void
    {
        $sr = $this->scheduled();
        $this->complete($this->vet1, $sr, ['completion_notes' => 'n', 'attachment' => $this->pdf()])->assertOk();

        $vetRow = collect($this->actingAs($this->vet2)->getJson('/api/vet/vaccination-requests')->assertOk()->json('data.completed'))->firstWhere('id', $sr->id);
        $this->assertSame('biosecurity-form.pdf', $vetRow['attachment']['original_name']);
        $this->assertSame($this->vet1->full_name, $vetRow['attachment']['uploaded_by']);

        $saRow = collect($this->actingAs($this->superAdmin)->getJson('/api/admin/service-requests')->assertOk()->json('data'))->firstWhere('id', $sr->id);
        $this->assertSame('application/pdf', $saRow['attachment']['mime_type']);

        $farmerRow = collect($this->actingAs($this->farmer)->getJson("/api/farmer/service-requests?farm_id={$this->farm->id}")->assertOk()->json('data.past'))->firstWhere('id', $sr->id);
        $this->assertNotNull($farmerRow['attachment']['file_size']);

        $farmRow = collect($this->actingAs($this->vet1)->getJson("/api/vet/farms/{$this->farm->id}/service-requests")->assertOk()->json('data.requests'))->firstWhere('id', $sr->id);
        $this->assertSame('biosecurity-form.pdf', $farmRow['attachment']['original_name']);
    }

    // ------------------------------------------------------ service type change

    public function test_farmer_can_request_farm_biosecurity_but_no_longer_vaccination(): void
    {
        $this->actingAs($this->farmer)->postJson('/api/farmer/service-requests', ['farm_id' => $this->farm->id, 'service_type' => ServiceTypes::VACCINE_LEGACY])
            ->assertStatus(422)->assertJsonValidationErrors(['service_type']);

        $res = $this->actingAs($this->farmer)->postJson('/api/farmer/service-requests', ['farm_id' => $this->farm->id, 'service_type' => ServiceTypes::FARM_BIOSECURITY, 'notes' => 'Need a biosecurity check.'])
            ->assertOk();
        $id = $res->json('data.id');
        $this->assertSame(ServiceTypes::FARM_BIOSECURITY, ServiceRequest::findOrFail($id)->service_type);

        // It is routed to the Vet (visible in their list, hidden from Staff), like Vaccine used to be.
        $this->assertNotNull(collect($this->actingAs($this->vet1)->getJson('/api/vet/vaccination-requests')->json('data.scheduled'))->firstWhere('id', $id));
        $this->assertNull(collect($this->actingAs($this->staff)->getJson('/api/admin/service-requests')->json('data'))->firstWhere('id', $id));
        $this->actingAs($this->staff)->patchJson("/api/admin/service-requests/{$id}/accept", ['scheduled_at' => '2027-04-10 09:00:00'])->assertStatus(403);
    }

    public function test_historical_vaccine_records_are_untouched_and_still_visible(): void
    {
        $before = ServiceRequest::where('service_type', ServiceTypes::VACCINE_LEGACY)->pluck('status', 'id')->all();

        $legacyDone = $this->scheduled(ServiceTypes::VACCINE_LEGACY, ['status' => 'Completed', 'completed_at' => now()->subMonth(), 'completion_notes' => 'Old vaccination.']);
        $legacyOpen = $this->scheduled(ServiceTypes::VACCINE_LEGACY);

        $vet = $this->actingAs($this->vet1)->getJson('/api/vet/vaccination-requests')->assertOk()->json('data');
        $this->assertSame(ServiceTypes::VACCINE_LEGACY, collect($vet['completed'])->firstWhere('id', $legacyDone->id)['service_type']);
        $this->assertSame(ServiceTypes::VACCINE_LEGACY, collect($vet['scheduled'])->firstWhere('id', $legacyOpen->id)['service_type']);
        $this->assertNull(collect($vet['completed'])->firstWhere('id', $legacyDone->id)['attachment']);

        $sa = $this->actingAs($this->superAdmin)->getJson('/api/admin/service-requests?service_type=Vaccine%20Request')->assertOk()->json('data');
        $this->assertNotNull(collect($sa)->firstWhere('id', $legacyDone->id));

        // Nothing pre-existing was rewritten by any of the calls above.
        $this->assertSame($before, ServiceRequest::where('service_type', ServiceTypes::VACCINE_LEGACY)->whereIn('id', array_keys($before))->pluck('status', 'id')->all());
        $this->assertSame('Old vaccination.', $legacyDone->fresh()->completion_notes);
    }
}
