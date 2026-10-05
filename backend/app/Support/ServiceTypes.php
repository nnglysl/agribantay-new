<?php

namespace App\Support;

/**
 * The service request types, in one place. service_type is a plain
 * varchar, so the allowed set lives here rather than in the schema.
 *
 * "Vaccine Request" was replaced by "Farm Biosecurity Request" as the
 * Veterinarian's active service. Rows already stored with the old value
 * are kept as they are: they are still a Vet type (listed, filtered,
 * reported and completable) but can no longer be requested.
 */
final class ServiceTypes
{
    public const FARM_BIOSECURITY = 'Farm Biosecurity Request';
    public const BLOOD_TEST       = 'Blood Test Request';
    public const ODOR_CONTROL     = 'Odor Control Request';
    public const FLY_CONTROL      = 'Fly Control Request';

    /** Legacy value, never offered for new requests. */
    public const VACCINE_LEGACY   = 'Vaccine Request';

    /** Handled by the Veterinarian (includes the legacy value for history). */
    public const VET = [self::FARM_BIOSECURITY, self::BLOOD_TEST, self::VACCINE_LEGACY];

    /** Handled by LGU Staff. */
    public const STAFF = [self::ODOR_CONTROL, self::FLY_CONTROL];

    /** What a farmer may submit today. */
    public const REQUESTABLE = [self::FARM_BIOSECURITY, self::BLOOD_TEST, self::ODOR_CONTROL, self::FLY_CONTROL];

    public static function isVet(string $type): bool
    {
        return in_array($type, self::VET, true);
    }

    /** Activity-log category for a Vet request type. */
    public static function activityType(string $type): string
    {
        return match ($type) {
            self::BLOOD_TEST       => 'Blood Test',
            self::FARM_BIOSECURITY => 'Farm Biosecurity',
            default                => 'Vaccination',
        };
    }
}
