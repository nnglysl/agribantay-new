<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * The single place the backend turns a stored instant into a string a person
 * reads.
 *
 * WHY THIS EXISTS
 * ---------------
 * Timestamps are stored in UTC (config('app.timezone') === 'UTC'), but every
 * reader of this system is in San Jose, Batangas (UTC+8). The frontend already
 * renders instants in the reader's local time, so any value the backend
 * pre-formatted with a bare ->format() disagreed with the same value rendered
 * in the browser — an alert triggered at 2026-07-18 19:04 UTC printed as
 * "Jul 18" in a report and "July 19" in the list on screen. Roughly a quarter
 * of existing rows were affected, being those stored between 16:00 and 23:59
 * UTC.
 *
 * Routing every instant through here fixes the disagreement without touching a
 * single stored value and without changing config('app.timezone'), which would
 * reinterpret all historical data at once.
 *
 * INSTANTS ONLY
 * -------------
 * Use these helpers for datetime columns — a moment that happened. Do NOT use
 * them for date-only columns (maintenance_logs.performed_at,
 * manure_disposal_records.disposal_date, sensors.installed_at,
 * generated_reports.period_start/period_end, and the other 'date' casts). Those
 * are calendar dates with no time of day; shifting them through a timezone is
 * meaningless and risks moving a clean-out onto the wrong day. They are
 * formatted directly at their call sites, deliberately.
 *
 * If APP_TIMEZONE is ever set to Asia/Manila, these conversions become no-ops
 * rather than double-shifting, because Carbon converts from the app timezone.
 */
class LocalTime
{
    /** The timezone report readers and dashboard users are in. */
    public static function timezone(): string
    {
        return config('app.display_timezone', 'Asia/Manila');
    }

    /** Convert a stored instant to the display timezone. Null-safe. */
    public static function forDisplay($value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        return Carbon::parse($value)->setTimezone(self::timezone());
    }

    /**
     * First instant of a local calendar day, as a local-zoned Carbon.
     *
     * Reporting periods are Philippine calendar dates: "September" means
     * 1 Sep 00:00:00 to 30 Sep 23:59:59 in San Jose, which is
     * 31 Aug 16:00:00Z to 30 Sep 15:59:59Z in storage. Eloquent converts a
     * zoned Carbon to UTC when it binds it, so returning a local-zoned Carbon
     * both queries the right window AND keeps ->toDateString() on the local
     * calendar date that gets persisted and printed.
     */
    public static function startOfLocalDay($date): Carbon
    {
        return Carbon::parse($date, self::timezone())->startOfDay();
    }

    /** Last instant of a local calendar day, as a local-zoned Carbon. */
    public static function endOfLocalDay($date): Carbon
    {
        return Carbon::parse($date, self::timezone())->endOfDay();
    }

    /** Calendar date of an instant, in local time — e.g. "Sep 11, 2026". */
    public static function date($value): ?string
    {
        return self::forDisplay($value)?->format('M d, Y');
    }

    /** Date and time of an instant, in local time — e.g. "Sep 11, 2026 8:35 PM". */
    public static function dateTime($value): ?string
    {
        return self::forDisplay($value)?->format('M d, Y g:i A');
    }

    /** Long-form date of an instant — e.g. "September 11, 2026". */
    public static function longDate($value): ?string
    {
        return self::forDisplay($value)?->format('F j, Y');
    }
}
