<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class NotificationController extends Controller
{
    /**
     * Returns the logged-in user's own notifications only — every role
     * (Farm Owner, Vet, Admin, Super Admin) hits this same endpoint and
     * only ever sees rows matching their own user_id, since that's how
     * the compliance system (and any future notification source) already
     * creates them.
     */
    public function index()
    {
        $notifications = Notification::where('user_id', Auth::id())
            ->latest()
            ->limit(30)
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $notifications,
            'unread_count' => Notification::where('user_id', Auth::id())
                ->where('is_read', false)
                ->count(),
        ]);
    }

    public function markRead(int $id)
    {
        $notification = Notification::where('user_id', Auth::id())->findOrFail($id);
        $notification->update(['is_read' => true]);

        return response()->json(['success' => true]);
    }

    public function markAllRead()
    {
        Notification::where('user_id', Auth::id())
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json(['success' => true]);
    }
}