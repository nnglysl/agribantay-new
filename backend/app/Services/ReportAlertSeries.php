<?php

namespace App\Services;

use App\Support\LocalTime;
use App\Support\ReportPeriod;
use Illuminate\Support\Carbon;

class ReportAlertSeries
{
    public function build($query, ReportPeriod $period): array
    {
        $offset = (int) (Carbon::now(LocalTime::timezone())->getOffset() / 60);
        $localDay = "DATE(DATE_ADD(triggered_at, INTERVAL {$offset} MINUTE))";
        $daily = (clone $query)->selectRaw("{$localDay} as day, COUNT(*) as total")
            ->groupByRaw($localDay)->orderByRaw($localDay)->get();
        $first = $period->from ?? $daily->first()?->day;
        $last = $period->to ?? $daily->last()?->day;
        $monthly = ! $period->from && ! $period->to;
        if ($first && $last) {
            $monthly = $monthly || Carbon::parse($first)->diffInDays(Carbon::parse($last)) > 62;
        }
        $unit = $monthly ? 'month' : 'day';
        if ($daily->isEmpty()) {
            return ['aggregation' => $unit, 'buckets' => [], 'total' => 0];
        }

        $counts = [];
        foreach ($daily as $row) {
            $key = $monthly ? substr($row->day, 0, 7) : $row->day;
            $counts[$key] = ($counts[$key] ?? 0) + (int) $row->total;
        }
        $cursor = Carbon::parse($first, LocalTime::timezone());
        $end = Carbon::parse($last, LocalTime::timezone());
        if ($monthly) {
            $cursor->startOfMonth();
            $end->startOfMonth();
        }
        $buckets = [];
        while ($cursor->lte($end)) {
            $key = $cursor->format($monthly ? 'Y-m' : 'Y-m-d');
            $buckets[] = ['key' => $key, 'label' => $cursor->format($monthly ? 'M Y' : 'M j, Y'), 'count' => $counts[$key] ?? 0];
            $monthly ? $cursor->addMonthNoOverflow() : $cursor->addDay();
        }

        return ['aggregation' => $unit, 'buckets' => $buckets, 'total' => (int) $daily->sum('total')];
    }
}
