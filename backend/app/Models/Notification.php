<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    /** Hide retired service notices for every role without rewriting history. */
    public function scopeVisibleTo($query, User $user)
    {
        $query->where('user_id', $user->id);
        $query->whereNot(function ($retired) {
                $retired->where(function ($service) {
                    $service->where(fn ($q) => $q->whereNotNull('type')->where('type', 'Request Update'))
                        ->orWhere(fn ($q) => $q->whereNotNull('link')->whereIn('link', [
                            '/farmowner/service-requests', '/admin/service-requests',
                            '/superadmin/service-requests', '/vet/vaccination-requests',
                        ]));
                })->where(function ($content) {
                    // Match the request subject, not an Odor/Fly phrase in a
                    // legitimate Vet request's reason or a Control Document.
                    foreach (\App\Support\ServiceTypes::RETIRED as $type) {
                        foreach (['Your ', 'The ', 'New ', ''] as $prefix) {
                            $content->orWhere(fn ($q) => $q->whereNotNull('message')
                                ->where(fn ($q) => $q->where('message', $prefix.$type)
                                    ->orWhere('message', 'like', $prefix.$type.' %')));
                        }
                        $content->orWhere(fn ($q) => $q->whereNotNull('title')
                            ->where(fn ($q) => $q->where('title', $type)
                                ->orWhere('title', 'like', $type.' %')));
                    }
                });
            });
        return $query;
    }

    protected $fillable = ['user_id', 'title', 'message', 'type', 'link', 'is_read'];

    protected $casts = [
        'is_read' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
