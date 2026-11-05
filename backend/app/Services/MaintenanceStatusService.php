<?php

namespace App\Services;

use App\Models\Farm;
use Carbon\Carbon;
use DateTimeInterface;

/** Authoritative annual compliance, evaluated on Asia/Manila calendar dates. */
class MaintenanceStatusService
{
    public const POLICY = 'annual_12_calendar_months_v1';
    public const FULL_CLEANOUT = 'Full Manure Clean-out';
    private const TIMEZONE = 'Asia/Manila';

    public function getStatus(Farm $farm, ?Carbon $asOf = null): array
    {
        $today = ($asOf?->copy() ?? Carbon::now(self::TIMEZONE))->setTimezone(self::TIMEZONE)->startOfDay();
        $registration = $this->registrationDate($farm->getRawOriginal('created_at'));
        $result = [
            'policy' => self::POLICY, 'status' => 'Undetermined',
            'registration_date' => $registration?->format('M d, Y'),
            'registration_date_raw' => $registration?->toDateString(),
            'last_performed_at' => null, 'last_full_cleanout_date' => null,
            'last_full_cleanout_date_raw' => null, 'latest_full_cleanout_id' => null,
            'required_interval' => '12 Calendar Months', 'interval_months' => 12,
            'days_since' => null, 'days_since_registration' => null,
            'days_remaining' => null, 'days_overdue' => null,
            'anchor_date' => null, 'due_date' => null, 'due_date_raw' => null,
            'non_compliant_from' => null, 'compliance_basis' => null,
            'undetermined_reason' => null, 'as_of_date' => $today->toDateString(),
        ];
        if (!$registration || $registration->gt($today)) {
            $result['undetermined_reason'] = 'A valid farm registration date is required.';
            return $result;
        }
        $result['days_since_registration'] = (int) $registration->diffInDays($today);
        $logs = $farm->relationLoaded('qualifyingCleanouts')
            ? $farm->qualifyingCleanouts : $farm->qualifyingCleanouts()->get();
        $last = null; $lastDate = null;
        foreach ($logs as $log) {
            $date = $this->calendarDate($log->getRawOriginal('performed_at'));
            if (!$date || $date->lt($registration)) {
                $result['undetermined_reason'] = 'A full clean-out has an invalid date or predates registration.';
                return $result;
            }
            // A historical cutoff ignores later work. A future date must never
            // reset a current cycle (the recording endpoint rejects it too).
            if ($date->gt($today)) {
                if ($asOf !== null) continue;
                $result['undetermined_reason'] = 'A recorded full clean-out is future-dated.';
                return $result;
            }
            if (!$lastDate || $date->gt($lastDate) || ($date->eq($lastDate) && $log->id > $last->id)) {
                $last = $log; $lastDate = $date;
            }
        }
        $anchor = $lastDate ?? $registration;
        $due = $anchor->copy()->addMonthsNoOverflow(12);
        $late = $today->gt($due);
        return array_merge($result, [
            'status' => $late ? 'Non-Compliant' : 'Compliant',
            'last_performed_at' => $lastDate?->format('M d, Y'),
            'last_full_cleanout_date' => $lastDate?->format('M d, Y'),
            'last_full_cleanout_date_raw' => $lastDate?->toDateString(),
            'latest_full_cleanout_id' => $last?->id,
            'days_since' => $lastDate ? (int) $lastDate->diffInDays($today) : null,
            'days_remaining' => $late ? 0 : (int) $today->diffInDays($due),
            'days_overdue' => $late ? (int) $due->diffInDays($today) : 0,
            'anchor_date' => $anchor->toDateString(),
            'due_date' => $due->format('M d, Y'), 'due_date_raw' => $due->toDateString(),
            'non_compliant_from' => $due->copy()->addDay()->toDateString(),
            'compliance_basis' => $lastDate ? 'latest_full_cleanout' : 'farm_registration',
        ]);
    }

    public function summary(iterable $farms, ?Carbon $asOf = null): array
    {
        $counts = ['policy' => self::POLICY, 'compliant' => 0, 'non_compliant' => 0, 'undetermined' => 0, 'total_farms' => 0];
        foreach ($farms as $farm) {
            $status = $this->getStatus($farm, $asOf)['status'];
            $key = ['Compliant' => 'compliant', 'Non-Compliant' => 'non_compliant', 'Undetermined' => 'undetermined'][$status];
            $counts[$key]++; $counts['total_farms']++;
        }
        return $counts;
    }

    private function registrationDate(mixed $raw): ?Carbon
    {
        if (!$raw) return null;
        try {
            if ($raw instanceof DateTimeInterface) return Carbon::instance($raw)->setTimezone(self::TIMEZONE)->startOfDay();
            if (!is_string($raw) || !$this->calendarDate(substr($raw, 0, 10))) return null;
            return Carbon::parse($raw, 'UTC')->setTimezone(self::TIMEZONE)->startOfDay();
        } catch (\Throwable) { return null; }
    }

    private function calendarDate(mixed $raw): ?Carbon
    {
        if ($raw instanceof DateTimeInterface) $raw = $raw->format('Y-m-d');
        if (!is_string($raw) || !preg_match('/\A(\d{4})-(\d{2})-(\d{2})\z/', $raw, $parts)
            || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])) return null;
        return Carbon::createFromFormat('!Y-m-d', $raw, self::TIMEZONE);
    }
}
