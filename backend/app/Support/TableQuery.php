<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;

/** Read-only table mechanics. Callers must establish their authorization scope first. */
class TableQuery
{
    public static function validate(Request $request): void
    {
        $rules = [
            'page' => 'nullable|integer|min:1|max:1000000000',
            'per_page' => 'nullable|integer|min:1|max:100',
            'search' => 'nullable|string|max:200', 'sort' => 'nullable|string|max:64',
            'dir' => 'nullable|in:asc,desc', 'query_key' => 'nullable|string|max:2000',
            'from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d',
            'tab' => 'nullable|string|max:32',
        ];
        foreach (['status', 'role', 'type', 'barangay', 'farm_size', 'monitoring_status', 'sensor_type', 'alert_status',
            'service_type', 'inspection_type', 'farm_name', 'scheduled_by_name', 'disposal_method', 'handled_by'] as $field) {
            $rules[$field] = 'nullable|string|max:511';
        }
        foreach (['farm_id', 'sensor_id'] as $field) {
            $rules[$field] = 'nullable|integer|min:1';
        }
        Validator::make($request->all(), $rules)->validate();
    }

    public static function order(Builder $query, Request $request, array $columns, string $default, string $direction = 'desc'): void
    {
        self::validate($request);
        $sort = $request->input('sort', $default);
        $column = $columns[$sort] ?? $columns[$default];
        $dir = $request->input('dir') ?: $direction;
        $query->reorder()->orderByRaw($column.' '.$dir)->orderBy($query->qualifyColumn('id'), $dir);
    }

    public static function paginate(Builder $query, Request $request): LengthAwarePaginator
    {
        self::validate($request);
        $size = (int) ($request->input('per_page') ?: 10);
        $total = (clone $query)->toBase()->getCountForPagination();
        $page = min((int) ($request->input('page') ?: 1), max(1, (int) ceil($total / $size)));

        return new LengthAwarePaginator($query->forPage($page, $size)->get(), $total, $size, $page);
    }

    public static function rows(Builder $query, Request $request): Collection
    {
        self::validate($request);
        if (! $request->filled('per_page')) {
            return $query->get();
        }
        $paginator = self::paginate($query, $request);
        $request->attributes->set('table_paginator', $paginator);

        return $paginator->getCollection();
    }

    /** For an existing derived business status which cannot be paged before evaluation. */
    public static function derived(Collection $rows, Request $request): Collection
    {
        self::validate($request);
        if (! $request->filled('per_page')) {
            return $rows->values();
        }
        $size = (int) $request->per_page;
        $total = $rows->count();
        $page = min((int) ($request->input('page') ?: 1), max(1, (int) ceil($total / $size)));
        $items = $rows->forPage($page, $size)->values();
        $request->attributes->set('table_paginator', new LengthAwarePaginator($items, $total, $size, $page));

        return $items;
    }

    public static function payload(Request $request, Collection $rows, array $extra = []): mixed
    {
        $page = $request->attributes->get('table_paginator');
        if (! $page) {
            return $rows->values();
        }

        return $extra + ['items' => $rows->values(), 'total' => $page->total(),
            'counts' => $request->attributes->get('table_counts', []),
            'page' => $page->currentPage(), 'current_page' => $page->currentPage(),
            'per_page' => $page->perPage(), 'last_page' => max(1, $page->lastPage()),
            'query_key' => $request->input('query_key')];
    }

    public static function dates(Builder $query, Request $request, string $column, bool $dateOnly = false): void
    {
        self::validate($request);
        foreach (['from' => '>=', 'to' => '<='] as $key => $operator) {
            if (! $request->filled($key)) {
                continue;
            }
            $day = LocalTime::startOfLocalDay($request->input($key));
            if ($dateOnly) {
                $query->whereDate($column, $operator, $day->toDateString());

                continue;
            }
            $bound = ($key === 'from' ? $day : $day->endOfDay())->utc();
            // Expressions are fixed by application code, never request text.
            $query->whereRaw($column.' '.$operator.' ?', [$bound]);
        }
    }

    public static function search(Builder $query, Request $request, array $columns, array $relations = []): void
    {
        self::validate($request);
        if (! $request->filled('search')) {
            return;
        }
        $needle = '%'.$request->input('search').'%';
        $query->where(function ($q) use ($columns, $relations, $needle) {
            foreach ($columns as $column) {
                $q->orWhere($column, 'like', $needle);
            }
            foreach ($relations as $relation => $fields) {
                $q->orWhereHas($relation, function ($related) use ($fields, $needle) {
                    $related->where(function ($match) use ($fields, $needle) {
                        foreach ($fields as $field) {
                            $match->orWhere($field, 'like', $needle);
                        }
                        if (in_array('first_name', $fields, true) && in_array('last_name', $fields, true)) {
                            $match->orWhereRaw(TableFilters::fullName($match).' LIKE ?', [$needle]);
                        }
                    });
                });
            }
        });
    }
}
