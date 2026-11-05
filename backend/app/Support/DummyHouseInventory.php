<?php

namespace App\Support;

use App\Models\Farm;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Explicit test-data evidence, never a physical inventory or closure certification. */
final class DummyHouseInventory
{
    public const PREFIX = 'DUMMY-ASSUMPTION/v1/';

    public const MESSAGE = 'User-approved dummy data: the initial House 1 is an assumption, not a physically verified inventory.';

    public static function marked(?string $reference): bool
    {
        return str_starts_with($reference ?? '', self::PREFIX);
    }

    public static function approved(Farm $farm, ?object $evidence): bool
    {
        if (! $evidence || (int) $evidence->farm_id !== (int) $farm->id || $farm->house_inventory_verified_at !== null
            || $evidence->source !== 'verified_population' || (int) $evidence->initial_house_count !== 1
            || $evidence->verifier_role !== 'super_admin' || ! $evidence->verified_by || ! $evidence->completed_at
            || ! Str::isUuid($evidence->operation_id)
            || ! preg_match('/\A[a-f0-9]{64}\z/D', $evidence->manifest_sha256 ?? '')
            || ! preg_match('/\A'.preg_quote(self::PREFIX, '/').'[a-f0-9]{64}\z/D', $evidence->verification_reference)) {
            return false;
        }

        return (int) $farm->last_house_number >= 1 && DB::table('poultry_houses')->where('farm_id', $farm->id)
            ->where('house_number', 1)->where('creation_request_id', $evidence->operation_id)->exists();
    }
}
