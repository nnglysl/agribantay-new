<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * The "Handled By" filter shared by the Staff and Vet service request lists.
 * Works on the existing ownership column (accepted_by) and the authenticated
 * user's id — never on names. Sits alongside, not instead of, the status,
 * type and search filters.
 *
 *   all        — no restriction
 *   mine       — accepted_by = me
 *   unassigned — accepted_by IS NULL (Pending, and declined requests that were never accepted)
 *   others     — accepted_by IS NOT NULL AND accepted_by != me
 */
final class HandledByFilter
{
    public const OPTIONS = ['all', 'mine', 'unassigned', 'others'];

    public static function apply(Builder $query, ?string $mode, int $userId): Builder
    {
        return match ($mode) {
            'mine'       => $query->where('accepted_by', $userId),
            'unassigned' => $query->whereNull('accepted_by'),
            'others'     => $query->whereNotNull('accepted_by')->where('accepted_by', '!=', $userId),
            default      => $query,
        };
    }
}
