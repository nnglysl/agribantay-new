<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inspection;
use App\Models\ActivityLog;
use App\Models\Notification;
use App\Services\SuperAdminNotifier;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use App\Models\Farm;
use App\Models\User;
use App\Support\LocalTime;

class InspectionController extends Controller
{
    public function index(Request $request)
    {
        $query = Inspection::with(['farm', 'assignedTo', 'scheduledBy']);

        if ($request->status) {
            $query->where('status', $request->status);
        }

        $inspections = $query->orderBy('scheduled_at')->get()->map(fn($i) => [
            'id'                => $i->id,
            'inspection_number' => $i->inspection_number,
            'farm_id'           => $i->farm_id,
            'farm_name'         => $i->farm->farm_name,
            'owner_name'        => $i->farm->owner_name,
            // Kept for existing consumers; now null-safe instead of a bare " ".
            'assigned_to'       => $i->assignedTo ? trim($i->assignedTo->first_name.' '.$i->assignedTo->last_name) : null,
            'assigned_to_id'    => $i->assigned_to,
            'assigned_to_name'  => $i->assignedTo ? trim($i->assignedTo->first_name.' '.$i->assignedTo->last_name) : null,
            'scheduled_by_id'   => $i->scheduled_by,
            'scheduled_by_name' => $i->scheduledBy ? trim($i->scheduledBy->first_name.' '.$i->scheduledBy->last_name) : null,
            'inspection_type'   => $i->inspection_type,
            'notes'             => $i->notes,
            'findings'          => $i->findings,
            'status'            => $i->status,
            'scheduled_at'      => $i->scheduled_at,
            'previous_scheduled_at' => $i->previous_scheduled_at,
            'reschedule_reason'     => $i->reschedule_reason,
            'cancellation_reason'   => $i->cancellation_reason,
            'completed_at'      => $i->completed_at,
        ]);

        return response()->json(['success' => true, 'data' => $inspections]);
    }

    public function store(Request $request)
    {
        // There is no separate assignment step: the Staff member who schedules
        // an inspection is the one who conducts it, so an 'assigned_to' in the
        // request is deliberately not accepted.
        $request->validate([
            'farm_id'         => 'required|exists:farms,id',
            'inspection_type' => 'required|in:General Inspection,Follow-up',
            'scheduled_at'    => 'required|date',
            'notes'           => 'nullable|string',
        ]);

        // The modal submits the wall-clock time the Staff member picked, with no
        // timezone attached. That is a Philippine local time. Parsing it on the
        // application clock (UTC) stored "09:00" as 09:00Z, which the UI then
        // rendered as 5:00 PM. It is parsed in the office timezone and stored
        // as the UTC instant it actually represents. Note that Eloquent does NOT
        // convert a zoned Carbon on save — the explicit ->utc() is required.
        $scheduledLocal = \Carbon\Carbon::parse($request->scheduled_at, LocalTime::timezone());
        $scheduledAtUtc = $scheduledLocal->copy()->utc();

        // Rule 1 — no scheduling on a date that's already passed. Compared
        // by LOCAL calendar date only (not time), so "today" is still valid even
        // if the current time has passed the requested time slot.
        if ($scheduledLocal->copy()->startOfDay()->lt(\Carbon\Carbon::now(LocalTime::timezone())->startOfDay())) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot schedule an inspection on a past date.',
            ], 422);
        }

        // Rule 2 — one ACTIVE inspection per farm. A farm with an inspection in
        // 'Scheduled' status (including one that is overdue) cannot be booked
        // again until that inspection is Completed or Cancelled.
        //
        // This replaces the earlier "one inspection per day, system-wide" rule.
        // That rule assumed a single scheduler and a single site visit per day;
        // with several Staff members each visiting different farms it blocked
        // legitimate same-day scheduling, while never stopping the same farm
        // being booked twice on different days (which is how farm 36 came to
        // hold two open inspections). A per-farm limit is the property that
        // actually matters: each farm gets at most one pending visit.
        //
        // The scheduler IS the responsible Staff member. assigned_to is kept
        // (older records and reports read it) and always mirrors scheduled_by
        // for anything scheduled from here on.
        $farmId     = (int) $request->farm_id;
        $assignedTo = Auth::id();

        // The check-then-insert is done under a lock on the farm row, which is
        // the natural mutex for "this farm's schedule": two Staff members
        // submitting for the same farm at the same instant are serialised, and
        // the second one sees the first one's row. Locking the farm rather than
        // the (possibly non-existent) inspection rows is what makes this hold
        // even when there is nothing to lock yet.
        // Isolation matters here. MySQL defaults to REPEATABLE READ, under which a
        // transaction reads from a snapshot taken at its FIRST non-locking read.
        // If that read ever happened before the lock below, a Staff member who
        // arrived a moment later would keep seeing "no active inspection" even
        // after the first one committed — and create a duplicate. Today the lock
        // is the first statement, so the snapshot is taken after it; READ
        // COMMITTED for this one transaction removes the dependence on that
        // ordering entirely, so a future query added above the lock cannot
        // silently reopen the race. Applies to the next transaction only.
        //
        // MySQL refuses to change isolation while a transaction is already open
        // (error 1568), which is the case under the test suite's
        // DatabaseTransactions wrapper. There the guard still holds because the
        // lock is the first statement; in a real request the level is 0 and the
        // stronger setting applies.
        if (DB::transactionLevel() === 0) {
            DB::statement('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        }

        // The requested LOCAL calendar day, as the UTC window the column is
        // stored in. Comparing on the raw timestamp would put an 8am Manila
        // visit in the previous UTC day and let a second farm through.
        $dayStartUtc = LocalTime::startOfLocalDay($scheduledLocal->toDateString());
        $dayEndUtc   = LocalTime::endOfLocalDay($scheduledLocal->toDateString());

        $result = DB::transaction(function () use ($request, $farmId, $assignedTo, $scheduledAtUtc, $dayStartUtc, $dayEndUtc) {
            Farm::lockForUpdate()->findOrFail($farmId);

            // Locked in the same order every time (farm, then staff member),
            // so two requests can never take them in opposite orders and
            // deadlock. This row is the mutex for "this person's day": two
            // farms booked for the same Staff member at the same instant lock
            // different farm rows, so the farm lock alone would let both
            // through.
            User::lockForUpdate()->find($assignedTo);

            $active = Inspection::where('farm_id', $farmId)
                ->where('status', 'Scheduled')
                ->orderBy('scheduled_at')
                ->first();

            if ($active) {
                return ['conflict' => $active];
            }

            // Rule 3 — one farm per Staff member per day.
            //
            // Biosecurity, not workload: a person who walks through one
            // poultry house and then another the same day carries whatever
            // the first flock has into the second. One site visit per person
            // per day is the control.
            //
            // Completed counts as well as Scheduled, because the visit
            // already happened — that is precisely the exposure. Cancelled
            // does not: nobody went.
            //
            // Scoped to the Staff member, which is what the old "one
            // inspection per day, system-wide" rule got wrong: it stopped a
            // SECOND Staff member visiting a different farm the same day,
            // which is no risk at all. Removing it dropped the biosecurity
            // limit altogether instead of narrowing it to one person.
            $sameDay = Inspection::with('farm')
                ->where('assigned_to', $assignedTo)
                ->whereIn('status', ['Scheduled', 'Completed'])
                ->whereBetween('scheduled_at', [$dayStartUtc, $dayEndUtc])
                ->orderBy('scheduled_at')
                ->first();

            if ($sameDay) {
                return ['same_day' => $sameDay];
            }

            // The number is derived from the auto-increment id, which the
            // database hands out atomically. The previous count()+1 scheme
            // gave two concurrent schedulers the same number (and would have
            // reused an old one after any deletion). A unique placeholder
            // satisfies the unique index until the id is known.
            $inspection = Inspection::create([
                'inspection_number' => 'TMP-'.Str::uuid(),
                'farm_id'           => $farmId,
                'assigned_to'       => $assignedTo,
                'scheduled_by'      => Auth::id(),
                'inspection_type'   => $request->inspection_type,
                'scheduled_at'      => $scheduledAtUtc,
                'notes'             => $request->notes,
                'status'            => 'Scheduled',
            ]);

            $n = $inspection->id;
            do {
                $number = 'INS-'.str_pad($n, 3, '0', STR_PAD_LEFT);
                $n++;
            } while (Inspection::where('inspection_number', $number)->where('id', '!=', $inspection->id)->exists());

            $inspection->update(['inspection_number' => $number]);

            return ['inspection' => $inspection];
        });

        if (isset($result['conflict'])) {
            $active = $result['conflict'];

            return response()->json([
                'success' => false,
                'message' => "This farm already has an active inspection ({$active->inspection_number}, scheduled ".LocalTime::longDate($active->scheduled_at).'). Complete or cancel it before scheduling another.',
                'data'    => ['active_inspection_id' => $active->id],
            ], 409);
        }

        if (isset($result['same_day'])) {
            $clash = $result['same_day'];
            $farmName = $clash->farm->farm_name ?? 'another farm';

            return response()->json([
                'success' => false,
                'message' => "You already have an inspection for \"{$farmName}\" on "
                    .LocalTime::longDate($clash->scheduled_at)
                    .'. For biosecurity, one staff member may visit only one farm per day. '
                    .'Choose another date, or ask a colleague to take this one.',
                'data'    => ['conflicting_inspection_id' => $clash->id],
            ], 409);
        }

        $inspection = $result['inspection'];
        $number = $inspection->inspection_number;

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Scheduled Inspection',
            'details' => "Scheduled inspection {$number}",
            'type'    => 'Inspection',
        ]);

        $scheduledFor = LocalTime::longDate($scheduledAtUtc);

        SuperAdminNotifier::notify(
            'Inspection Scheduled',
            "An inspection for \"{$inspection->farm->farm_name}\" has been scheduled on {$scheduledFor}.",
            'Inspection Scheduled',
            '/superadmin/inspections'
        );

        if ($inspection->farm->user_id) {
            Notification::create([
                'user_id' => $inspection->farm->user_id,
                'title'   => 'Inspection Scheduled',
                'message' => "An inspection has been scheduled for your farm on {$scheduledFor}.",
                'type'    => 'Inspection Scheduled',
                'link'    => '/farmowner/inspections',
                'is_read' => false,
            ]);
        }

        if ($inspection->assigned_to) {
            $assignee = \App\Models\User::find($inspection->assigned_to);
            $assigneeLink = $assignee?->role === 'vet'
                ? "/vet/farms/{$inspection->farm_id}"
                : '/admin/inspections';

            // Addressed to the person who scheduled it, because assigned_to is
            // set to the scheduler (see store(): "The scheduler IS the
            // responsible Staff member"). Nobody hands an inspection to anyone
            // here, so "you have been assigned" described a workflow the system
            // does not have — and told the reader they had been given work when
            // they had just created it themselves.
            Notification::create([
                'user_id' => $inspection->assigned_to,
                'title'   => 'Inspection Scheduled',
                'message' => "You scheduled an inspection for \"{$inspection->farm->farm_name}\" on {$scheduledFor}.",
                'type'    => 'Inspection Scheduled',
                'link'    => $assigneeLink,
                'is_read' => false,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Inspection scheduled.',
            'data'    => $inspection,
        ]);
    }

    /**
     * Cancelling needs a reason: the Farm Owner is told their inspection is
     * off, and "it was cancelled" with no explanation is not something they
     * can act on. The reason is stored on the record and repeated verbatim in
     * their notification, so the history and the message can never disagree.
     */
    public function cancel(Request $request, int $id)
    {
        $request->validate([
            'reason' => 'required|string|min:3|max:1000',
        ], [
            'reason.required' => 'A cancellation reason is required.',
            'reason.min'      => 'Please give a slightly longer reason.',
        ]);

        $inspection = Inspection::with('farm')->findOrFail($id);

        if ($inspection->status === 'Cancelled') {
            return response()->json([
                'success' => false,
                'message' => 'This inspection has already been cancelled.',
            ], 422);
        }

        $reason = trim($request->reason);

        // Formatted before the write so the notification quotes the same
        // moment the record holds, in Manila time like everything else shown.
        $scheduledFor = LocalTime::dateTime($inspection->scheduled_at);

        // The status change and the Farm Owner's notification go in together.
        // The business flow treats the notification as part of cancelling, so
        // a cancelled inspection whose owner was never told would be a worse
        // outcome than the cancellation failing outright and being retried.
        try {
            DB::transaction(function () use ($inspection, $reason, $scheduledFor) {
                $inspection->update([
                    'status'              => 'Cancelled',
                    'cancellation_reason' => $reason,
                ]);

                // Only this farm's owner — taken from the inspection's own farm
                // relationship, never from a broader query.
                if ($inspection->farm?->user_id) {
                    Notification::create([
                        'user_id' => $inspection->farm->user_id,
                        'title'   => 'Inspection Cancelled',
                        'message' => "Your scheduled inspection for \"{$inspection->farm->farm_name}\""
                            . ($scheduledFor ? " on {$scheduledFor}" : '')
                            . " has been cancelled. Reason: {$reason}",
                        'type'    => 'Inspection Cancelled',
                        // The same destination the other inspection
                        // notifications use, so Mark as Read and click-through
                        // behave identically.
                        'link'    => '/farmowner/inspections',
                        'is_read' => false,
                    ]);
                }
            });
        } catch (QueryException $e) {
            Log::error('Inspection cancellation failed', [
                'inspection_id' => $inspection->id,
                'exception'     => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'The inspection could not be cancelled. Please try again.',
            ], 500);
        }

        // Outside the transaction: this one is for Super Admin oversight, not
        // part of the record, and a failure here must not undo the cancellation.
        SuperAdminNotifier::notify(
            'Inspection Cancelled',
            "Inspection {$inspection->inspection_number} for \"{$inspection->farm->farm_name}\" was cancelled. Reason: {$reason}",
            'Inspection Cancelled',
            '/superadmin/inspections'
        );

        return response()->json([
            'success' => true,
            'message' => 'Inspection cancelled. The farm owner has been notified.',
        ]);
    }

    /**
     * Moves a Scheduled inspection to a new date/time without touching its
     * status or identity — keeps a record of what the previous schedule
     * was and why, instead of the Cancel-and-recreate workaround. Mirrors
     * the same reschedule shape used by service requests (Admin & Vet).
     */
    public function reschedule(Request $request, int $id)
    {
        $request->validate([
            'scheduled_at' => 'required|date',
            'reason'       => 'required|string',
        ]);

        $inspection = Inspection::findOrFail($id);

        // Same local-time handling as store(): the submitted value is a
        // Philippine wall-clock time and is stored as its UTC instant.
        $scheduledLocal = \Carbon\Carbon::parse($request->scheduled_at, LocalTime::timezone());
        $scheduledAtUtc = $scheduledLocal->copy()->utc();

        if ($scheduledLocal->copy()->startOfDay()->lt(\Carbon\Carbon::now(LocalTime::timezone())->startOfDay())) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot reschedule an inspection to a past date.',
            ], 422);
        }

        // Only a Scheduled inspection can move. Rescheduling keeps the farm, so
        // the one-active-per-farm rule cannot be broken here.
        if ($inspection->status !== 'Scheduled') {
            return response()->json([
                'success' => false,
                'message' => 'Only a scheduled inspection can be rescheduled.',
            ], 422);
        }

        // The one-farm-per-staff-per-day rule applies here too. Enforcing it
        // only in store() left the same hole open by another door: schedule
        // two farms on two days, then move the second onto the first.
        // Measured against the inspection's OWN assignee, not whoever is
        // moving it — the rule is about who walks onto the farm.
        $dayStartUtc = LocalTime::startOfLocalDay($scheduledLocal->toDateString());
        $dayEndUtc   = LocalTime::endOfLocalDay($scheduledLocal->toDateString());

        $sameDay = Inspection::with('farm')
            ->where('assigned_to', $inspection->assigned_to)
            ->where('id', '!=', $inspection->id)
            ->whereIn('status', ['Scheduled', 'Completed'])
            ->whereBetween('scheduled_at', [$dayStartUtc, $dayEndUtc])
            ->first();

        if ($sameDay) {
            $farmName = $sameDay->farm->farm_name ?? 'another farm';

            return response()->json([
                'success' => false,
                'message' => "That date already has an inspection for \"{$farmName}\" assigned to the same staff member. "
                    .'For biosecurity, one staff member may visit only one farm per day.',
                'data'    => ['conflicting_inspection_id' => $sameDay->id],
            ], 409);
        }

        $inspection->update([
            'previous_scheduled_at' => $inspection->scheduled_at,
            'scheduled_at'          => $scheduledAtUtc,
            'reschedule_reason'     => $request->reason,
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Rescheduled Inspection',
            'details' => "{$inspection->inspection_number} — {$inspection->farm->farm_name}",
            'type'    => 'Inspection',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Inspection rescheduled.',
            'data'    => $inspection,
        ]);
    }

    public function complete(Request $request, int $id)
    {
        $request->validate([
            'findings' => 'required|string',
        ]);

        $inspection = Inspection::findOrFail($id);
        $inspection->update([
            'status'       => 'Completed',
            'findings'     => $request->findings,
            'completed_at' => now(),
        ]);

        ActivityLog::create([
            'user_id' => Auth::id(),
            'role'    => Auth::user()->role,
            'action'  => 'Completed Inspection',
            'details' => "{$inspection->inspection_number} — {$inspection->farm->farm_name}",
            'type'    => 'Inspection',
        ]);

        SuperAdminNotifier::notify(
            'Inspection Completed',
            "Inspection {$inspection->inspection_number} for \"{$inspection->farm->farm_name}\" has been completed.",
            'Inspection Completed',
            '/superadmin/inspections'
        );

        return response()->json([
            'success' => true,
            'message' => 'Inspection marked as completed.',
            'data'    => $inspection,
        ]);
    }
}