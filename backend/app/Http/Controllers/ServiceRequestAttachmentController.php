<?php

namespace App\Http\Controllers;

use App\Models\ServiceRequest;
use App\Models\ServiceRequestAttachment;
use App\Support\ServiceTypes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

/**
 * Serves the accomplished form attached to a completed service request.
 * The file sits on the private disk, so this is the only way to reach it;
 * every request is checked against the caller's role and, for farmers,
 * their own farm.
 */
class ServiceRequestAttachmentController extends Controller
{
    /**
     * One attachment by id; without an id (the original single-file route)
     * the most recent one.
     */
    public function show(Request $request, int $id, ?int $attachmentId = null)
    {
        $sr = ServiceRequest::with(['farm'])->findOrFail($id);

        if (! $this->canView($sr)) {
            return response()->json(['success' => false, 'message' => 'You are not allowed to view this attachment.'], 403);
        }

        // Always scoped to this request: an id belonging to another request is a 404.
        $attachment = $attachmentId === null
            ? $sr->attachments()->reorder('id', 'desc')->first()
            : $sr->attachments()->whereKey($attachmentId)->first();
        if (! $attachment) {
            return response()->json(['success' => false, 'message' => 'This request has no such attached file.'], 404);
        }

        $disk = Storage::disk(ServiceRequestAttachment::DISK);
        if (! $disk->exists($attachment->file_path)) {
            return response()->json(['success' => false, 'message' => 'The attached file is missing from storage.'], 404);
        }

        $disposition = $request->boolean('download') ? 'attachment' : 'inline';
        // Only the original name's safe characters reach the header.
        $name = preg_replace('/[^A-Za-z0-9._ -]/', '_', $attachment->original_name) ?: 'attachment';

        return response()->file($disk->path($attachment->file_path), [
            'Content-Type'        => $attachment->mime_type,
            'Content-Disposition' => $disposition . '; filename="' . $name . '"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control'       => 'private, no-store',
        ]);
    }

    /**
     * Mirrors who can see the request itself: Super Admin everything, Vets
     * the Vet types, Staff the Staff types, and a farmer only their own farm.
     */
    private function canView(ServiceRequest $sr): bool
    {
        $user = Auth::user();
        if (! $user) return false;

        return match ($user->role) {
            'super_admin' => true,
            'vet'         => ServiceTypes::isVet($sr->service_type),
            'admin'       => ! ServiceTypes::isVet($sr->service_type),
            'farm_owner'  => (int) $sr->requested_by === (int) $user->id
                             || ($sr->farm && (int) $sr->farm->user_id === (int) $user->id),
            default       => false,
        };
    }
}
