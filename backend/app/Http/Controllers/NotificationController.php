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
    public function index(Request $request)
    {
        // `limit` backs the bell's "See More": the panel opens with a short
        // list and asks for a larger one each time it is pressed, rather than
        // paging — so the rows already on screen keep their position, their
        // read state and their date grouping, and nothing can arrive twice.
        // Capped so a crafted request cannot ask for the whole table.
        $limit = min(max((int) $request->input('limit', 10), 1), 100);

        $base = Notification::where('user_id', Auth::id());

        $total = (clone $base)->count();

        $notifications = (clone $base)
            ->latest()
            ->limit($limit)
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $notifications,
            'unread_count' => (clone $base)->where('is_read', false)->count(),
            // Lets the panel hide "See More" at the end instead of offering a
            // press that would return the same rows again.
            'total_count' => $total,
            'has_more'    => $total > $notifications->count(),
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