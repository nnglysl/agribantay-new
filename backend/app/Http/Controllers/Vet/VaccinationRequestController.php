<?php

namespace App\Http\Controllers\Vet;

use App\Http\Controllers\Controller;
use App\Models\ServiceRequest;
use App\Models\ServiceRequestAttachment;
use App\Models\ActivityLog;
use App\Models\Notification;
use App\Services\SuperAdminNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\File;
use App\Support\LocalTime;
use App\Support\ServiceTypes;
use App\Support\HandledByFilter;

class VaccinationRequestController extends Controller
{
    // Farm Biosecurity, Blood Test, and the legacy Vaccine value kept for history.
    private const VET_TYPES = ServiceTypes::VET;

    // Same ceiling as the system's other uploads (profile/maintenance photos).
    public const ATTACHMENT_MAX_KB = 5120;
    public const ATTACHMENT_MIMES  = ['application/pdf', 'image/jpeg', 'image/png'];
    // Enough for the 3-page form plus two supporting photos.
    public const ATTACHMENT_MAX_FILES = 5;

    private function isSuperAdmin(): bool
    {
        return Auth::user()?->role === 'super_admin';
    }

    /**
     * Ownership rule: the Vet who accepted a request is responsible for it,
     * and only they may complete, reschedule or undo it.
     *
     * Super Admin override: the route group is 'role:vet,super_admin', so the
     * Super Admin can already reach every Vet endpoint; that role is allowed
     * past this check too, for consistency with the Staff module. The Super
     * Admin UI stays view-only; the override is API-level.
     */
    private function guardOwnership(ServiceRequest $sr): ?\Illuminate\Http\JsonResponse
    {
        if ($this->isSuperAdmin() || (int) $sr->accepted_by === (int) Auth::id()) {
            return null;
        }

        $owner = $sr->acceptedBy ? trim($sr->acceptedBy->first_name.' '.$sr->acceptedBy->last_name) : 'another Veterinarian';

        return response()->json([
            'success' => false,
            'message' => "This request is handled by {$owner}. Only the Veterinarian who accepted it can act on it.",
        ], 403);
    }

    /**
     * The modals submit a Philippine wall-clock time with no timezone. Parsed
     * on the application clock (UTC) it was stored as-is, so "09:00" came back
     * as 5:00 PM. Interpreted in the office timezone and stored as the UTC
     * instant. Eloquent does not convert a zoned Carbon on save, hence ->utc().
     */
    private function localToUtc(string $value): Carbon
    {
        return Carbon::parse($value, LocalTime::timezone())->utc();
    }

    private function notifyRequester(ServiceRequest $sr, string $title, string $message): void
    {
        // Super Admin gets the same update for system-wide oversight.
        SuperAdminNotifier::notify($title, preg_replace('/^Your /', 'The ', $message), 'Request Update', '/superadmin/service-requests');

        if (!$sr->requested_by) {
            return;
        }

        Notification::create([
            'user_id' => $sr->requested_by,
            'title'   => $title,
            'message' => $message,
            'type'    => 'Request Update',
            'link'    => '/farmowner/service-requests',
            'is_read' => false,
        ]);
    }


    public function index(Request $request)
    {
        // Shared list: every Veterinarian sees every Vaccine and Blood Test
        // request, whoever accepted it. Ownership is carried on each row
        // (accepted_by / accepted_by_id) and enforced by the action endpoints,
        // not by hiding rows — a colleague's accepted visit must be visible so
        // the office can see who is handling what. Previously the list was
        // filtered to "mine or unassigned", which hid other Vets' work.
        // Ordered oldest-first so requests are worked in submission order.
        // Optional handled_by=all|mine|unassigned|others (see HandledByFilter)
        // narrows the shared list without changing who may see what.
        $query = ServiceRequest::with(['farm', 'acceptedBy', 'attachments.uploader'])
            ->whereIn('service_type', self::VET_TYPES);
        HandledByFilter::apply($query, $request->handled_by, (int) Auth::id());

        $requests = $query
            ->oldest()
            ->get()
            ->map(fn($r) => [
                    'id'             => $r->id,
                    'request_number' => $r->request_number,
                    'service_type'   => $r->service_type,
                    'farm_id'        => $r->farm->id,
                    'farm_name'      => $r->farm->farm_name,
                    'owner_name'     => $r->farm->owner_name,
                    'barangay'       => $r->farm->barangay,
                    'farm_size'      => $r->farm->farm_size,
                    'notes'          => $r->notes,
                    'completion_notes' => $r->completion_notes,
                    ...self::attachmentPayload($r),
                    'status'         => $r->status,
                    'accepted_by'    => $r->acceptedBy ? $r->acceptedBy->first_name . ' ' . $r->acceptedBy->last_name : null,
                    'accepted_by_id' => $r->accepted_by,
                    'scheduled_at'   => $r->scheduled_at,
                    'previous_scheduled_at' => $r->previous_scheduled_at,
                    'reschedule_reason'     => $r->reschedule_reason,
                    'decline_reason' => $r->decline_reason,
                    'completed_at'   => $r->completed_at,
                    'created_at'     => $r->created_at,
                    'updated_at'     => $r->updated_at,
                ]);

        return response()->json([
            'success' => true,
            'data' => [
                'scheduled' => $requests->whereIn('status', ['Scheduled', 'Pending'])->values(),
                'completed' => $requests->where('status', 'Completed')->values(),
                // Completed + declined, so a declined request stays visible.
                'history'   => $requests->whereIn('status', ['Completed', 'Cancelled'])->values(),
            ],
        ]);
    }

    public function accept(Request $request, int $id)
    {
        $request->validate([
            'scheduled_at' => 'required|date',
        ]);

        $scheduledAtUtc = $this->localToUtc($request->scheduled_at);

        // Acceptance is first-come, first-served and must be decided atomically.
        // The row is read under an exclusive lock, so two Vets pressing Accept at
        // the same instant are serialised: the second one sees the status the
        // first one just wrote. A locking read always returns the latest
        // committed row, so this does not depend on isolation level.
        $result = DB::transaction(function () use ($id, $scheduledAtUtc) {
            $sr = ServiceRequest::with('acceptedBy')->lockForUpdate()->findOrFail($id);

            if (! in_array($sr->service_type, self::VET_TYPES, true)) {
                return ['blocked' => response()->json([
                    'success' => false,
                    'message' => 'This request type is not handled by the Veterinarian.',
                ], 403)];
            }

            if ($sr->status !== 'Pending') {
                return ['conflict' => $sr];
            }

            $sr->update([
                'accepted_by'  => Auth::id(),
                'status'       => 'Scheduled',
                'scheduled_at' => $scheduledAtUtc,
            ]);

            return ['sr' => $sr];
        });

        if (isset($result['blocked'])) return $result['blocked'];

        if (isset($result['conflict'])) {
            $sr = $result['conflict'];
            $owner = $sr->acceptedBy ? trim($sr->acceptedBy->first_name.' '.$sr->acceptedBy->last_name) : null;
            $why = $sr->status === 'Scheduled' && $owner
                ? "This request has already been accepted by {$owner}."
                : "This request is no longer pending (it is {$sr->status}).";

            return response()->json(['success' => false, 'message' => $why], 409);
        }

        $sr = $result['sr'];

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Scheduled ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => ServiceTypes::activityType($sr->service_type),
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Scheduled',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" has been scheduled."
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' scheduled.',
            'data'    => $sr,
        ]);
    }

    public function decline(Request $request, int $id)
    {
        $request->validate([
            'decline_reason' => 'required|string|min:3',
        ]);

        $sr = ServiceRequest::findOrFail($id);

        // Declining is a response to a Pending request. Once another Vet has
        // accepted it, it is their visit.
        if ($sr->status !== 'Pending') {
            return response()->json([
                'success' => false,
                'message' => 'Only a pending request can be declined.',
            ], 422);
        }

        $sr->update(['status' => 'Cancelled', 'decline_reason' => $request->decline_reason]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Declined Service Request',
            'details' => "{$sr->service_type} — {$sr->farm->farm_name}",
            'type'    => 'Service',
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Declined',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" was declined: {$request->decline_reason}"
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' declined.',
        ]);
    }

    /**
     * Only reachable once the farm visit actually happened — the vet's
     * observations/actions/findings/recommendations from that visit are
     * required here rather than optional, since this is the one place in
     * the workflow those get recorded. A visit that didn't happen goes
     * through reschedule() instead, never here.
     */
    public function complete(Request $request, int $id)
    {
        // The accomplished form is uploaded with the notes as one multipart
        // body: up to ATTACHMENT_MAX_FILES files under attachments[] (the
        // original single-file field "attachment" is still accepted). PHP
        // only parses multipart on POST, so the route exists as both PATCH
        // (JSON, as before) and POST. Every file is checked here regardless
        // of what the browser claimed.
        $fileRule = [
            File::types(['pdf', 'jpg', 'jpeg', 'png'])->max(self::ATTACHMENT_MAX_KB),
            'mimetypes:' . implode(',', self::ATTACHMENT_MIMES),
            'extensions:pdf,jpg,jpeg,png',
        ];
        $fileMessages = [
            'mimetypes'  => 'Each attached file must be a PDF, JPG or PNG.',
            'extensions' => 'Each attached file must be a PDF, JPG or PNG.',
            'mimes'      => 'Each attached file must be a PDF, JPG or PNG.',
            'max'        => 'Each attached file must not be larger than 5 MB.',
        ];
        $request->validate([
            'completion_notes' => 'required|string',
            'attachments'      => ['nullable', 'array', 'max:' . self::ATTACHMENT_MAX_FILES],
            'attachments.*'    => array_merge(['file'], $fileRule),
            'attachment'       => array_merge(['nullable'], $fileRule),
        ], array_merge(
            ['attachments.max' => 'You can attach up to ' . self::ATTACHMENT_MAX_FILES . ' files per request.'],
            collect($fileMessages)->mapWithKeys(fn ($m, $rule) => ["attachments.*.{$rule}" => $m])->all(),
            collect($fileMessages)->mapWithKeys(fn ($m, $rule) => ["attachment.{$rule}" => $m])->all(),
        ));

        $sr = ServiceRequest::findOrFail($id);

        // Only an accepted, scheduled visit can be completed — never a
        // Pending, Cancelled or already-Completed request, even via the API.
        if ($sr->status !== 'Scheduled') {
            return response()->json([
                'success' => false,
                'message' => 'Only a scheduled request can be marked as completed.',
            ], 422);
        }

        if ($blocked = $this->guardOwnership($sr)) return $blocked;

        /** @var \Illuminate\Http\UploadedFile[] $files */
        $files = array_values(array_filter(array_merge(
            (array) $request->file('attachments', []),
            $request->hasFile('attachment') ? [$request->file('attachment')] : [],
        )));

        // Attachments already on file (from a completion that was undone) are
        // kept and count toward the limit; nothing is replaced silently.
        $existingCount = $sr->attachments()->count();
        if ($existingCount + count($files) > self::ATTACHMENT_MAX_FILES) {
            $room = max(0, self::ATTACHMENT_MAX_FILES - $existingCount);
            return response()->json([
                'success' => false,
                'message' => "A request can have at most " . self::ATTACHMENT_MAX_FILES . " attachments. "
                    . ($existingCount > 0
                        ? "{$existingCount} already on file, so you can add {$room} more."
                        : "Please remove some files and try again."),
                'errors'  => ['attachments' => ['Maximum of ' . self::ATTACHMENT_MAX_FILES . ' attachments per request.']],
            ], 422);
        }

        // A Farm Biosecurity visit is only complete once the accomplished form
        // is on file (at least one file, new or already attached). Other Vet
        // services may attach files but need not; rows completed before this
        // rule existed are left as they are.
        if ($existingCount + count($files) === 0 && $sr->service_type === ServiceTypes::FARM_BIOSECURITY) {
            return response()->json([
                'success' => false,
                'message' => 'Please attach the accomplished Farm Biosecurity form before completing this request.',
                'errors'  => ['attachments' => ['The accomplished Farm Biosecurity form is required (at least one file).']],
            ], 422);
        }

        // The rules above accept any allowed content with any allowed name;
        // additionally each name's extension must agree with the sniffed bytes
        // (a PNG called "form.pdf" is refused), and the stored name always
        // takes the extension implied by the bytes.
        $byMime = ['application/pdf' => ['pdf'], 'image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png']];
        $plan = [];
        foreach ($files as $i => $file) {
            $sniffed = $file->getMimeType();
            $ext     = strtolower($file->getClientOriginalExtension());
            if (! isset($byMime[$sniffed]) || ! in_array($ext, $byMime[$sniffed], true)) {
                return response()->json([
                    'success' => false,
                    'message' => "\"{$file->getClientOriginalName()}\" is not a valid PDF, JPG or PNG file.",
                    'errors'  => ["attachments.{$i}" => ['The file\'s content does not match its extension.']],
                ], 422);
            }
            $plan[] = ['file' => $file, 'mime' => $sniffed, 'ext' => $byMime[$sniffed][0]];
        }

        // Write the files first, then the rows in one transaction, so the
        // request is never Completed without its form and a failed DB write
        // leaves no stray files behind. Re-checking the status and the count
        // under a row lock makes a double submission a no-op instead of a
        // second completion or a sixth file.
        $storedPaths = [];
        $disk = Storage::disk(ServiceRequestAttachment::DISK);
        $discard = function () use (&$storedPaths, $disk) {
            foreach ($storedPaths as $path) $disk->delete($path);
        };
        try {
            foreach ($plan as $k => $item) {
                $path = $item['file']->storeAs(
                    'service-request-attachments/' . $sr->id,
                    Str::uuid() . '.' . $item['ext'],
                    ServiceRequestAttachment::DISK
                );
                if ($path === false) {
                    throw new \RuntimeException('An attached file could not be saved.');
                }
                $storedPaths[$k] = $path;
            }

            $outcome = DB::transaction(function () use ($sr, $request, $plan, $storedPaths) {
                $locked = ServiceRequest::lockForUpdate()->findOrFail($sr->id);
                if ($locked->status !== 'Scheduled') {
                    return 'already';
                }
                if ($locked->attachments()->count() + count($plan) > self::ATTACHMENT_MAX_FILES) {
                    return 'too-many';
                }

                foreach ($plan as $k => $item) {
                    ServiceRequestAttachment::create([
                        'service_request_id' => $locked->id,
                        'uploaded_by'        => Auth::id(),
                        'original_name'      => Str::limit($item['file']->getClientOriginalName(), 200, ''),
                        'file_path'          => $storedPaths[$k],
                        'mime_type'          => $item['mime'],
                        'file_size'          => $item['file']->getSize(),
                    ]);
                }

                // completion_notes is its own column so the farmer's original
                // request text in `notes` is never overwritten.
                $locked->update([
                    'status'           => 'Completed',
                    'completed_at'     => now(),
                    'completion_notes' => $request->completion_notes,
                ]);

                return 'done';
            });
        } catch (\Throwable $e) {
            $discard();
            throw $e;
        }

        if ($outcome !== 'done') {
            $discard();
            return response()->json([
                'success' => false,
                'message' => $outcome === 'too-many'
                    ? 'A request can have at most ' . self::ATTACHMENT_MAX_FILES . ' attachments.'
                    : 'Only a scheduled request can be marked as completed.',
            ], 422);
        }

        $sr->refresh()->load('attachments.uploader');

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Completed ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => ServiceTypes::activityType($sr->service_type),
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Completed',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" has been completed."
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' marked as completed.',
            'data'    => array_merge($sr->toArray(), self::attachmentPayload($sr)),
        ]);
    }

    /**
     * Remove one attachment from a request that has been reopened (Undo
     * Completion). Only while the request is Scheduled — a completed
     * record's files are never editable — and only by the Vet who owns it
     * (or the Super Admin), the same rule as completing it. The row and the
     * private file go together, so nothing is orphaned.
     */
    public function removeAttachment(int $id, int $attachmentId)
    {
        $sr = ServiceRequest::findOrFail($id);

        if ($sr->status !== 'Scheduled') {
            return response()->json([
                'success' => false,
                'message' => 'Attachments can only be removed while the request is scheduled. Undo the completion first.',
            ], 422);
        }

        if ($blocked = $this->guardOwnership($sr)) return $blocked;

        $attachment = $sr->attachments()->whereKey($attachmentId)->first();
        if (! $attachment) {
            return response()->json(['success' => false, 'message' => 'Attachment not found on this request.'], 404);
        }

        DB::transaction(function () use ($attachment) {
            $path = $attachment->file_path;
            $attachment->delete();
            Storage::disk(ServiceRequestAttachment::DISK)->delete($path);
        });

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Removed attachment from ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$attachment->original_name}",
            'type'    => ServiceTypes::activityType($sr->service_type),
        ]);

        $sr->load('attachments.uploader');

        return response()->json([
            'success' => true,
            'message' => 'Attachment removed.',
            'data'    => self::attachmentPayload($sr),
        ]);
    }

    /**
     * Attachment fields shared by every list/detail payload: the full list
     * plus the legacy single `attachment` (most recent) kept for callers
     * written against the one-file version.
     */
    public static function attachmentPayload(ServiceRequest $sr): array
    {
        $list = $sr->attachments->map(fn ($a) => $a->toSummary())->values()->all();

        return [
            'attachments'      => $list,
            'attachment'       => $list ? end($list) : null,
            'attachment_count' => count($list),
            'attachment_max'   => self::ATTACHMENT_MAX_FILES,
        ];
    }

    /**
     * Undo an accidental completion. The request goes back to Scheduled —
     * not Pending, since it was already accepted — keeping its schedule,
     * acceptor and reschedule history; only status/completed_at change.
     * If its date has already passed it will show under Overdue (derived).
     */
    public function reopen(int $id)
    {
        $sr = ServiceRequest::findOrFail($id);

        if ($sr->status !== 'Completed') {
            return response()->json([
                'success' => false,
                'message' => 'Only a completed request can have its completion undone.',
            ], 422);
        }

        if ($blocked = $this->guardOwnership($sr)) return $blocked;

        // Reopening must not sidestep the farmer's one-active-request-per-
        // service rule: if they've since submitted another request for the
        // same service, this one stays completed.
        $hasOtherActive = ServiceRequest::where('farm_id', $sr->farm_id)
            ->where('service_type', $sr->service_type)
            ->where('id', '!=', $sr->id)
            ->whereIn('status', ['Pending', 'Scheduled'])
            ->exists();

        if ($hasOtherActive) {
            return response()->json([
                'success' => false,
                'message' => 'The completion cannot be undone because another active request for the same service already exists.',
            ], 422);
        }

        $sr->update([
            'status'       => 'Scheduled',
            'completed_at' => null,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Undid completion of ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => ServiceTypes::activityType($sr->service_type),
        ]);

        $this->notifyRequester(
            $sr,
            'Service Request Completion Undone',
            "Your {$sr->service_type} for \"{$sr->farm->farm_name}\" was marked completed by mistake; its completion was undone and it has returned to its active scheduled state."
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' completion undone. The request has returned to its active scheduled state.',
            'data'    => $sr,
        ]);
    }

    /**
     * For a scheduled visit that didn't happen — moves the date/time
     * forward, keeps the request active (never touches status), and keeps
     * a record of what the previous schedule was and why it changed. Can
     * be called again if the new visit also falls through; each call
     * simply overwrites the "previous" snapshot with whatever was current
     * right before this reschedule.
     */
    public function reschedule(Request $request, int $id)
    {
        $request->validate([
            'scheduled_at' => 'required|date',
            'reason'       => 'required|string',
        ]);

        $sr = ServiceRequest::findOrFail($id);

        if ($sr->status !== 'Scheduled') {
            return response()->json([
                'success' => false,
                'message' => 'Only a scheduled request can be rescheduled.',
            ], 422);
        }

        if ($blocked = $this->guardOwnership($sr)) return $blocked;

        $sr->update([
            'previous_scheduled_at' => $sr->scheduled_at,
            'scheduled_at'          => $this->localToUtc($request->scheduled_at),
            'reschedule_reason'     => $request->reason,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Rescheduled ' . strtolower($sr->service_type),
            'details' => "{$sr->request_number} — {$sr->farm->farm_name}",
            'type'    => ServiceTypes::activityType($sr->service_type),
        ]);

        return response()->json([
            'success' => true,
            'message' => ucfirst($sr->service_type) . ' rescheduled.',
            'data'    => $sr,
        ]);
    }
}