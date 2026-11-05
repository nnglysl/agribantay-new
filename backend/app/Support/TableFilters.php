<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/** Existing table controls expressed on a fully authorized query, before paging. */
class TableFilters
{
    public static function history(Builder $query, Request $request, string $kind): void
    {
        TableQuery::validate($request);
        $config = match ($kind) {
            'cleanout' => ['performed_at', ['date' => 'performed_at', 'performed_at' => 'performed_at'], []],
            'disposal' => ['disposal_date', ['disposal_date' => 'disposal_date', 'quantity' => 'quantity'], ['disposal_method']],
            'inspection' => ['COALESCE(completed_at, scheduled_at)', ['date' => 'COALESCE(completed_at, scheduled_at)', 'type' => 'inspection_type'], ['inspection_type', 'status']],
            'service' => ['created_at', ['created_at' => 'created_at'], ['service_type']],
        };
        [$date, $sorts, $fields] = $config;
        foreach ($fields as $field) {
            $request->validate([$field => 'nullable|string|max:255']);
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }
        TableQuery::dates($query, $request, $date, in_array($kind, ['cleanout', 'disposal'], true));
        TableQuery::search($query, $request, match ($kind) {
            'disposal' => ['buyer_name', 'notes'], 'inspection' => ['inspection_type'],
            'cleanout' => ['notes'], 'service' => ['request_number', 'service_type'],
        });
        TableQuery::order($query, $request, $sorts, array_key_first($sorts));
    }

    public static function requests(Builder $query, Request $request, string $default = 'asc'): void
    {
        // Apply before filtering, counts and pagination. Old legacy-tab URLs
        // must never turn an active request list into a retired-record browser.
        $query->operational();
        TableQuery::validate($request);
        $request->validate(['service_type' => 'nullable|string|max:255', 'status' => 'nullable|string|max:32']);
        foreach (['service_type', 'status'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }
        TableQuery::dates($query, $request, 'created_at');
        TableQuery::search($query, $request, ['request_number', 'service_type'],
            ['farm' => ['farm_name', 'owner_name', 'barangay'], 'requestedBy' => ['first_name', 'last_name']]);
        $direction = $request->input('sort', $default === 'asc' ? 'oldest' : 'newest') === 'newest' ? 'desc' : $default;
        if ($request->input('sort') === 'oldest') {
            $direction = 'asc';
        }
        $query->reorder()->orderBy('created_at', $direction)->orderBy('id', $direction);
        self::counts($query, $request, false);
        self::tab($query, $request->input('tab'), false);
    }

    public static function inspections(Builder $query, Request $request, string $direction = 'asc'): void
    {
        TableQuery::validate($request);
        $request->validate(['inspection_type' => 'nullable|string|max:255', 'status' => 'nullable|string|max:32',
            'farm_name' => 'nullable|string|max:255', 'scheduled_by_name' => 'nullable|string|max:511']);
        foreach (['inspection_type', 'status'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }
        if ($request->filled('farm_name')) {
            $query->whereHas('farm', fn ($q) => $q->where('farm_name', $request->farm_name));
        }
        if ($request->filled('scheduled_by_name')) {
            $query->whereHas('scheduledBy', fn ($q) => $q->whereRaw(self::fullName($q).' = ?', [$request->scheduled_by_name]));
        }
        TableQuery::dates($query, $request, 'scheduled_at');
        $query->where(function ($matches) use ($request) {
            TableQuery::search($matches, $request, ['inspection_number', 'inspection_type', 'status'],
                ['farm' => ['farm_name', 'owner_name'], 'scheduledBy' => ['first_name', 'last_name']]);
            if ($request->filled('search') && str_contains('overdue', strtolower($request->search))) {
                $matches->orWhere(fn ($due) => self::tab($due, 'overdue', true));
            }
        });
        $query->reorder()->orderBy('scheduled_at', $direction)->orderBy('id', $direction);
        self::counts($query, $request, true);
        self::tab($query, $request->input('tab'), true);
    }

    private static function counts(Builder $query, Request $request, bool $inspection): void
    {
        if (! $request->filled('per_page')) {
            return;
        }
        $cutoff = now(LocalTime::timezone())->startOfDay()->utc();
        $groups = (clone $query)->reorder()->selectRaw('status, COUNT(*) AS total, SUM(CASE WHEN scheduled_at < ? THEN 1 ELSE 0 END) AS overdue', [$cutoff])
            ->groupBy('status')->get()->keyBy('status');
        $pending = (int) ($groups['Pending']->total ?? 0);
        $scheduled = (int) ($groups['Scheduled']->total ?? 0);
        $overdue = (int) ($groups['Scheduled']->overdue ?? 0);
        $completed = (int) ($groups['Completed']->total ?? 0);
        $cancelled = (int) ($groups['Cancelled']->total ?? 0);
        $request->attributes->set('table_counts', ['pending' => $pending, 'scheduled' => $scheduled - $overdue,
            'overdue' => $overdue, 'completed' => $completed, 'history' => $completed + $cancelled,
            'upcoming' => $scheduled, 'active' => $pending + $scheduled, 'past' => $completed + $cancelled]);
    }

    public static function tab(Builder $query, ?string $tab, bool $inspection): void
    {
        // Both existing screens keep today's visits Scheduled until that
        // Manila calendar day ends, regardless of the scheduled hour.
        $cutoff = now(LocalTime::timezone())->startOfDay()->utc();
        switch ($tab) {
            case 'legacy':
                abort_if($inspection, 422, 'Invalid table tab.');
                $query->whereRaw('1 = 0'); // Retired request-list bookmarks are empty.
                break;
            case 'pending': $query->where('status', 'Pending');
                break;
            case 'scheduled':
                $query->where('status', 'Scheduled')->where(fn ($q) => $q->whereNull('scheduled_at')->orWhere('scheduled_at', '>=', $cutoff));
                break;
            case 'overdue': $query->where('status', 'Scheduled')->where('scheduled_at', '<', $cutoff);
                break;
            case 'upcoming': $query->where('status', 'Scheduled');
                break;
            case 'active': $query->whereIn('status', ['Pending', 'Scheduled']);
                break;
            case 'completed': $query->where('status', 'Completed');
                break;
            case 'history': case 'past': $query->whereIn('status', ['Completed', 'Cancelled']);
                break;
            case null: case '': break;
            default: abort(422, 'Invalid table tab.');
        }
    }

    public static function fullName(Builder $query): string
    {
        return $query->getConnection()->getDriverName() === 'sqlite'
            ? "TRIM(first_name || ' ' || last_name)" : "TRIM(CONCAT(first_name, ' ', last_name))";
    }
}
