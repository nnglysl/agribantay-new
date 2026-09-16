<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * System-wide oversight notifications for Super Admins. Inspection and
 * service-request events already notify the farmer/admin/vet involved; this
 * adds the Super Admin as a recipient so their dashboard's Inspections and
 * Service Requests tabs reflect what is happening across all farms.
 * Uses the existing notifications table/types — no separate system.
 * The acting user is skipped so a Super Admin never notifies themself.
 */
class SuperAdminNotifier
{
    public static function notify(string $title, string $message, string $type, string $link): void
    {
        $recipients = User::where('role', 'super_admin')
            ->where('status', 'active')
            ->when(Auth::id(), fn ($q) => $q->where('id', '!=', Auth::id()))
            ->get();

        foreach ($recipients as $recipient) {
            Notification::create([
                'user_id' => $recipient->id,
                'title'   => $title,
                'message' => $message,
                'type'    => $type,
                'link'    => $link,
                'is_read' => false,
            ]);
        }
    }
}
