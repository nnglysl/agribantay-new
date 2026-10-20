<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Reporting bounds are Manila calendar dates; timestamp columns are UTC. */
class ReportPeriod
{
    public const INSPECTION_DATE = "CASE WHEN status = 'Completed' THEN completed_at ELSE scheduled_at END";

    public const SERVICE_DATE = "CASE WHEN status = 'Completed' THEN completed_at WHEN status = 'Scheduled' THEN scheduled_at ELSE created_at END";

    public function __construct(public ?string $from, public ?string $to) {}

    public static function fromRequest(Request $request): self
    {
        $request->validate([
            'from' => 'nullable|date_format:Y-m-d',
            'to' => ['nullable', 'date_format:Y-m-d', ...($request->filled('from') ? ['after_or_equal:from'] : [])],
        ]);

        return new self($request->input('from') ?: null, $request->input('to') ?: null);
    }

    public function scope($query, string $column, bool $dateOnly = false)
    {
        $expression = in_array($column, [self::INSPECTION_DATE, self::SERVICE_DATE], true)
            ? DB::raw($column) : $column;
        if ($this->from) {
            $query->where($expression, '>=', $dateOnly ? $this->from : LocalTime::startOfLocalDay($this->from)->utc());
        }
        if ($this->to) {
            $query->where($expression, '<=', $dateOnly ? $this->to : LocalTime::endOfLocalDay($this->to)->utc());
        }

        return $query;
    }

    public function asOf(): Carbon
    {
        $now = now();
        $end = $this->to ? LocalTime::endOfLocalDay($this->to)->utc() : $now;

        return $end->lt($now) ? $end : $now;
    }
}
