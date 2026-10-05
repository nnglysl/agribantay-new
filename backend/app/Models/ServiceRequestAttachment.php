<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ServiceRequestAttachment extends Model
{
    /** Private disk: files are only reachable through the download endpoint. */
    public const DISK = 'local';

    protected $fillable = [
        'service_request_id',
        'uploaded_by',
        'original_name',
        'file_path',
        'mime_type',
        'file_size',
    ];

    protected $casts = [
        'file_size' => 'integer',
    ];

    public function serviceRequest()
    {
        return $this->belongsTo(ServiceRequest::class);
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /** Shape shared by every list/detail endpoint. */
    public function toSummary(): array
    {
        return [
            'id' => $this->id,
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'file_size' => $this->file_size,
            'uploaded_at' => $this->created_at,
            'uploaded_by' => $this->uploader ? trim($this->uploader->first_name.' '.$this->uploader->last_name) : null,
        ];
    }
}
