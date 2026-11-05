<?php

namespace App\Models;

use App\Support\LocalTime;
use Illuminate\Database\Eloquent\Model;

class FarmControlDocument extends Model
{
    public const DISK = 'local';
    public const CATEGORIES = ['odor_control' => 'Odor Control', 'fly_control' => 'Fly Control'];
    public const MIME_EXTENSIONS = ['application/pdf' => ['pdf'], 'image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png']];

    protected $fillable = ['farm_id', 'uploaded_by', 'uploader_name', 'category', 'original_name', 'file_path', 'mime_type', 'file_size', 'remarks'];
    protected $hidden = ['file_path'];
    protected $casts = ['file_size' => 'integer'];

    public function farm()
    {
        return $this->belongsTo(Farm::class);
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function toSummary(bool $latest): array
    {
        return ['id' => $this->id, 'farm_id' => $this->farm_id, 'category' => $this->category,
            'document_type' => self::CATEGORIES[$this->category], 'original_name' => $this->original_name,
            'mime_type' => $this->mime_type, 'file_size' => $this->file_size, 'remarks' => $this->remarks,
            'uploaded_at' => LocalTime::dateTime($this->created_at), 'uploaded_at_raw' => $this->created_at->toIso8601String(),
            'uploaded_by' => $this->uploader_name, 'is_latest' => $latest,
            'status' => $latest ? 'On File' : 'Previous Submission'];
    }
}
