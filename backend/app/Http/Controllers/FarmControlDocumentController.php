<?php

namespace App\Http\Controllers;

use App\Models\Farm;
use App\Models\FarmControlDocument;
use App\Support\TableQuery;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;
use Illuminate\Validation\ValidationException;

class FarmControlDocumentController extends Controller
{
    private function farm(Request $request, int $farmId): Farm
    {
        $query = Farm::query();
        if ($request->user()->role === 'farm_owner') $query->where('user_id', $request->user()->id);
        $farm = $query->findOrFail($farmId);
        Gate::authorize('viewAny', [FarmControlDocument::class, $farm]);

        return $farm;
    }

    private function available(): void
    {
        abort_unless(Schema::hasTable('farm_control_documents'), 503,
            'Control Documents are not available yet. Please contact system support.');
    }

    public function index(Request $request, int $farmId)
    {
        $farm = $this->farm($request, $farmId);
        $this->available();
        $request->validate(['category' => ['nullable', Rule::in(array_keys(FarmControlDocument::CATEGORIES))]]);
        $request->mergeIfMissing(['per_page' => 5]);

        $data = DB::transaction(function () use ($request, $farm) {
            $latest = $farm->controlDocuments()->whereIn('id', $farm->controlDocuments()
                ->selectRaw('MAX(id)')->groupBy('category'))->get()->keyBy('category');
            $query = $farm->controlDocuments()->getQuery()->orderByDesc('id');
            if ($request->filled('category')) $query->where('category', $request->category);
            $rows = TableQuery::rows($query, $request)->map(fn ($doc) => $doc->toSummary($latest->get($doc->category)?->id === $doc->id));

            return TableQuery::payload($request, $rows, ['farm_id' => $farm->id,
                'max_file_kb' => config('control_documents.max_kb', 5120),
                'latest' => collect(FarmControlDocument::CATEGORIES)->map(fn ($label, $category) => $latest->get($category)?->toSummary(true))]);
        });

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function store(Request $request, int $farmId)
    {
        $farm = $this->farm($request, $farmId);
        Gate::authorize('create', [FarmControlDocument::class, $farm]);
        $this->available();
        $validated = $request->validate([
            'category' => ['required', Rule::in(array_keys(FarmControlDocument::CATEGORIES))],
            'document' => ['required', File::types(['pdf', 'jpg', 'jpeg', 'png'])->max(config('control_documents.max_kb', 5120)),
                'mimetypes:application/pdf,image/jpeg,image/png', 'extensions:pdf,jpg,jpeg,png'],
            'remarks' => 'nullable|string|max:1000', 'farm_id' => 'prohibited',
        ]);
        $file = $request->file('document');
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());
        $extensions = FarmControlDocument::MIME_EXTENSIONS[$mime] ?? [];
        if (! in_array(strtolower($file->getClientOriginalExtension()), $extensions, true) || $file->getSize() < 1) {
            throw ValidationException::withMessages(['document' => 'The file content must match its PDF, JPG or PNG extension and must not be empty.']);
        }
        $name = basename(str_replace('\\', '/', $file->getClientOriginalName()));
        $name = Str::limit(preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?: 'document.'.$extensions[0], 200, '');
        $disk = Storage::disk(FarmControlDocument::DISK);
        $path = null;
        try {
            $path = $file->storeAs('farm-control-documents/'.$farm->id, Str::uuid().'.'.$extensions[0], FarmControlDocument::DISK);
            if (! $path) throw new \RuntimeException('The document could not be stored.');
            $document = DB::transaction(function () use ($request, $farm, $validated, $file, $mime, $name, $path) {
                $locked = Farm::lockForUpdate()->findOrFail($farm->id);
                Gate::authorize('create', [FarmControlDocument::class, $locked]);

                return $locked->controlDocuments()->create([
                    'uploaded_by' => $request->user()->id, 'uploader_name' => $request->user()->full_name,
                    'category' => $validated['category'], 'original_name' => $name, 'file_path' => $path,
                    'mime_type' => $mime, 'file_size' => $file->getSize(), 'remarks' => $validated['remarks'] ?? null,
                ]);
            });
        } catch (\Throwable $error) {
            // Only this failed operation's generated file; never an old submission.
            if ($path) $disk->delete($path);
            if ($error instanceof \Illuminate\Auth\Access\AuthorizationException
                || $error instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) throw $error;
            report($error);

            return response()->json(['success' => false, 'message' => 'The document could not be saved. Please try again.'], 503);
        }

        return response()->json(['success' => true, 'message' => 'Document submitted. Previous submissions have been kept.',
            'data' => $document->toSummary(true)], 201);
    }

    public function file(Request $request, int $farmId, int $documentId)
    {
        $farm = $this->farm($request, $farmId);
        $this->available();
        $request->validate(['download' => 'nullable|boolean']);
        $document = $farm->controlDocuments()->findOrFail($documentId);
        Gate::authorize('view', $document);
        $expected = '#\Afarm-control-documents/'.$farm->id.'/[a-f0-9-]{36}\.(pdf|jpg|png)\z#D';
        abort_unless(preg_match($expected, $document->file_path)
            && isset(FarmControlDocument::MIME_EXTENSIONS[$document->mime_type]), 404);
        $disk = Storage::disk(FarmControlDocument::DISK);
        abort_unless($disk->exists($document->file_path), 404, 'The document file is unavailable.');
        $name = preg_replace('/[^A-Za-z0-9._ -]/', '_', $document->original_name) ?: 'document';

        return response()->file($disk->path($document->file_path), [
            'Content-Type' => $document->mime_type,
            'Content-Disposition' => ($request->boolean('download') ? 'attachment' : 'inline').'; filename="'.$name.'"',
            'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store',
            'Content-Security-Policy' => "sandbox; default-src 'none'", 'Referrer-Policy' => 'no-referrer',
        ]);
    }
}
