<?php

namespace App\Support;

/**
 * The manure disposal methods, in one place. disposal_method is a plain
 * varchar, so the allowed set lives here rather than in the schema — the same
 * arrangement as {@see ServiceTypes}.
 *
 * Before this existed, the only definition was the `in:` rule inside
 * Farmer\DisposalController@store, and the Farm Profile's Disposal Method
 * filter built its options from whichever records happened to be on the
 * current page. A method with no record on that page was simply missing from
 * the filter. The list is now served with the records so the filter always
 * offers every valid method, whatever the page holds.
 */
final class DisposalMethods
{
    public const SOLD      = 'Sold';
    public const COMPOSTED = 'Composted on-site';
    public const OTHER     = 'Other';

    /** Every method a disposal record may be stored with. */
    public const ALL = [self::SOLD, self::COMPOSTED, self::OTHER];

    /** Pipe-joined for a validation `in:` rule. */
    public static function validationRule(): string
    {
        return 'in:' . implode(',', self::ALL);
    }

    /**
     * The full option list for a filter, in a stable order.
     *
     * Any value found in the data but not in ALL is appended rather than
     * dropped, so a record written before this list existed (or by a direct
     * database edit) stays filterable instead of becoming invisible.
     *
     * @param  iterable<string|null>  $storedValues
     * @return list<string>
     */
    public static function filterOptions(iterable $storedValues = []): array
    {
        $extra = [];

        foreach ($storedValues as $value) {
            $value = trim((string) $value);

            if ($value !== '' && !in_array($value, self::ALL, true) && !in_array($value, $extra, true)) {
                $extra[] = $value;
            }
        }

        sort($extra);

        return array_values(array_merge(self::ALL, $extra));
    }
}
