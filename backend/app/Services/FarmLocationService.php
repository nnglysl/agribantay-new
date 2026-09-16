<?php

namespace App\Services;

use App\Models\Farm;
use Illuminate\Validation\ValidationException;

/**
 * Farm location rules, shared by every farm create/edit path
 * (Register Farm Owner, Add to Existing Owner, Edit Farm — Admin and
 * Super Admin) and by the frontend's live check endpoint.
 *
 * validate() runs the checks in this order and stops at the first failure:
 *
 *   1. pin is inside San Jose, Batangas  (config/geography.php polygon)
 *   2. barangay is an official barangay   (config/geography.php keys)
 *   3. barangay <-> pin consistency       (checkBarangay(), below)
 *   4. one-farm-per-area                  (findConflictingFarm(), below)
 *
 * "Pin exists" and "coordinates are numeric" are enforced by the
 * controllers' request validation before this service is reached.
 *
 * One-farm-per-area: farm pins come from geocoding or from the Admin
 * dragging a marker, so two pins for "the same spot" are never bit-identical;
 * a farm counts as occupying an area when it sits within
 * config('farms.duplicate_location_radius_meters') of another farm's pin.
 */
class FarmLocationService
{
    public const CONFLICT_MESSAGE = 'This area is already marked. Please select a different location.';

    public const OUTSIDE_MESSAGE = 'Location outside San Jose, Batangas. Please select a location within San Jose.';

    public const MISMATCH_MESSAGE = 'The selected location does not match the selected barangay. Please move the pin or select the correct barangay.';

    public const INVALID_BARANGAY_MESSAGE = 'The selected barangay is not a barangay of San Jose, Batangas.';

    public const STATUS_OUTSIDE = 'outside';
    public const STATUS_INVALID_BARANGAY = 'invalid_barangay';
    public const STATUS_MISMATCH = 'mismatch';
    public const STATUS_CONFLICT = 'conflict';
    public const STATUS_VERIFIED = 'verified';
    public const STATUS_UNVERIFIED = 'unverified';

    private const EARTH_RADIUS_METERS = 6371000;

    public function radiusMeters(): int
    {
        return (int) config('farms.duplicate_location_radius_meters', 50);
    }

    // -----------------------------------------------------------------------
    // Full check
    // -----------------------------------------------------------------------

    /**
     * Run every location rule for a prospective pin + barangay.
     *
     * Returns ['status', 'ok', 'message', 'detected_barangay'] where `ok`
     * is whether the farm may be saved. Blocking statuses: outside,
     * invalid_barangay, mismatch, conflict. Non-blocking: verified,
     * unverified (see checkBarangay() for what "unverified" means).
     */
    public function validate(float $latitude, float $longitude, string $barangay, ?int $excludeFarmId = null): array
    {
        if (!$this->isInsideSanJose($latitude, $longitude)) {
            return $this->result(self::STATUS_OUTSIDE, false, self::OUTSIDE_MESSAGE);
        }

        if (!$this->isOfficialBarangay($barangay)) {
            return $this->result(self::STATUS_INVALID_BARANGAY, false, self::INVALID_BARANGAY_MESSAGE);
        }

        $barangayCheck = $this->checkBarangay($latitude, $longitude, $barangay);
        if ($barangayCheck['status'] === self::STATUS_MISMATCH) {
            return $barangayCheck;
        }

        if ($this->findConflictingFarm($latitude, $longitude, $excludeFarmId)) {
            return $this->result(self::STATUS_CONFLICT, false, self::CONFLICT_MESSAGE, $barangayCheck['detected_barangay']);
        }

        return $barangayCheck;
    }

    /**
     * validate() as a guard: throws a normal 422 ValidationException keyed
     * on `location` only — a single key keeps the response's top-level
     * `message` equal to the rule's message, which is what the forms show.
     * (The live check endpoint is where the UI gets `detected_barangay`.)
     */
    public function assertValidLocation(float $latitude, float $longitude, string $barangay, ?int $excludeFarmId = null): array
    {
        $result = $this->validate($latitude, $longitude, $barangay, $excludeFarmId);

        if (!$result['ok']) {
            throw ValidationException::withMessages([
                'location' => [$result['message']],
            ]);
        }

        return $result;
    }

    // -----------------------------------------------------------------------
    // 1. Municipality boundary
    // -----------------------------------------------------------------------

    /** Point-in-polygon against the San Jose boundary in config/geography.php. */
    public function isInsideSanJose(float $latitude, float $longitude): bool
    {
        return $this->pointInPolygon($latitude, $longitude, config('geography.municipality.boundary', []));
    }

    // -----------------------------------------------------------------------
    // 2. Official barangay list
    // -----------------------------------------------------------------------

    /** @return string[] the 33 official barangay names, in dropdown spelling. */
    public function officialBarangays(): array
    {
        return array_keys(config('geography.barangays', []));
    }

    public function isOfficialBarangay(string $barangay): bool
    {
        return array_key_exists($barangay, config('geography.barangays', []));
    }

    // -----------------------------------------------------------------------
    // 3. Barangay <-> pin consistency
    // -----------------------------------------------------------------------

    /**
     * Does the pin plausibly sit in the selected barangay?
     *
     * The decision ladder, strongest evidence first. Only a CLEAR
     * contradiction yields `mismatch`; when the data can't settle it the
     * answer is `unverified`, which the caller allows but surfaces to the
     * user rather than pretending it was confirmed.
     *
     *   a. The pin is inside another barangay's OSM boundary polygon
     *      -> mismatch (definitive; detected_barangay = that barangay).
     *   b. The selected barangay has a polygon:
     *        - pin inside it -> verified
     *        - pin within the edge tolerance of it -> unverified
     *          (OSM boundary lines are not survey-grade)
     *        - otherwise -> mismatch
     *   c. The selected barangay has only a reference point (28 of 33):
     *        - farther than barangay_max_distance_meters -> mismatch
     *        - at least barangay_far_min_meters away AND barangay_far_ratio
     *          times closer to some other barangay's point -> mismatch
     *          (detected_barangay = that nearer barangay)
     *        - otherwise -> unverified. A radius alone can't prove the
     *          pin is in this barangay rather than the neighbouring one.
     *
     * Live reverse geocoding is deliberately NOT part of this ladder —
     * see the header of config/geography.php for why.
     */
    public function checkBarangay(float $latitude, float $longitude, string $barangay): array
    {
        $barangays = config('geography.barangays', []);
        $selected = $barangays[$barangay] ?? null;

        if ($selected === null) {
            return $this->result(self::STATUS_INVALID_BARANGAY, false, self::INVALID_BARANGAY_MESSAGE);
        }

        // (a) inside somebody else's official boundary
        foreach ($barangays as $name => $entry) {
            if ($name !== $barangay && !empty($entry['polygon']) && $this->pointInPolygon($latitude, $longitude, $entry['polygon'])) {
                return $this->result(self::STATUS_MISMATCH, false, self::MISMATCH_MESSAGE, $name);
            }
        }

        // (b) the selected barangay has an official boundary
        if (!empty($selected['polygon'])) {
            if ($this->pointInPolygon($latitude, $longitude, $selected['polygon'])) {
                return $this->result(self::STATUS_VERIFIED, true, "Pin is within Brgy. {$barangay}.", $barangay);
            }

            $tolerance = (int) config('farms.barangay_edge_tolerance_meters', 150);
            if ($this->distanceToPolygonMeters($latitude, $longitude, $selected['polygon']) <= $tolerance) {
                return $this->result(
                    self::STATUS_UNVERIFIED,
                    true,
                    "The pin is just outside the mapped boundary of Brgy. {$barangay}. Please double-check its position.",
                    $barangay
                );
            }

            return $this->result(self::STATUS_MISMATCH, false, self::MISMATCH_MESSAGE);
        }

        // (c) reference point only
        $distance = $this->distanceMeters($latitude, $longitude, $selected['center'][0], $selected['center'][1]);
        $maxDistance = (int) config('farms.barangay_max_distance_meters', 3000);

        if ($distance > $maxDistance) {
            return $this->result(self::STATUS_MISMATCH, false, self::MISMATCH_MESSAGE);
        }

        $nearestOther = null;
        $nearestOtherDistance = null;
        foreach ($barangays as $name => $entry) {
            if ($name === $barangay) {
                continue;
            }
            $d = $this->distanceMeters($latitude, $longitude, $entry['center'][0], $entry['center'][1]);
            if ($nearestOtherDistance === null || $d < $nearestOtherDistance) {
                $nearestOther = $name;
                $nearestOtherDistance = $d;
            }
        }

        $farMin = (int) config('farms.barangay_far_min_meters', 1500);
        $farRatio = (float) config('farms.barangay_far_ratio', 3);

        if ($nearestOther !== null && $distance >= $farMin && $distance >= $farRatio * $nearestOtherDistance) {
            return $this->result(self::STATUS_MISMATCH, false, self::MISMATCH_MESSAGE, $nearestOther);
        }

        return $this->result(
            self::STATUS_UNVERIFIED,
            true,
            "Brgy. {$barangay} has no official boundary in the map data, so the pin could not be fully verified. Please double-check its position.",
            null
        );
    }

    // -----------------------------------------------------------------------
    // 4. One-farm-per-area
    // -----------------------------------------------------------------------

    /**
     * The nearest other farm within the duplicate radius, or null when the
     * spot is free. $excludeFarmId is the farm being edited — its own pin
     * must never count against itself.
     */
    public function findConflictingFarm(float $latitude, float $longitude, ?int $excludeFarmId = null): ?Farm
    {
        $radius = $this->radiusMeters();

        $nearest = null;
        $nearestDistance = null;

        Farm::query()
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->when($excludeFarmId, fn ($q) => $q->where('id', '!=', $excludeFarmId))
            ->get(['id', 'farm_name', 'latitude', 'longitude'])
            ->each(function (Farm $farm) use ($latitude, $longitude, $radius, &$nearest, &$nearestDistance) {
                $distance = $this->distanceMeters($latitude, $longitude, (float) $farm->latitude, (float) $farm->longitude);
                if ($distance <= $radius && ($nearestDistance === null || $distance < $nearestDistance)) {
                    $nearest = $farm;
                    $nearestDistance = $distance;
                }
            });

        return $nearest;
    }

    /**
     * Throws a normal 422 ValidationException (keyed on `location`) when the
     * spot is already taken, so the request never reaches the database.
     */
    public function assertLocationAvailable(float $latitude, float $longitude, ?int $excludeFarmId = null): void
    {
        if ($this->findConflictingFarm($latitude, $longitude, $excludeFarmId)) {
            throw ValidationException::withMessages([
                'location' => [self::CONFLICT_MESSAGE],
            ]);
        }
    }

    // -----------------------------------------------------------------------
    // Geometry
    // -----------------------------------------------------------------------

    /** Great-circle (haversine) distance between two coordinates, in metres. */
    public function distanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * self::EARTH_RADIUS_METERS * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * Ray-casting point-in-polygon over a ring of [lat, lng] pairs — the
     * same algorithm as isPointInPolygon() in frontend/src/utils/farmLocation.js
     * so both sides agree on edge cases.
     */
    public function pointInPolygon(float $lat, float $lng, array $polygon): bool
    {
        $n = count($polygon);
        if ($n < 3) {
            return false;
        }

        $inside = false;
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            [$latI, $lngI] = $polygon[$i];
            [$latJ, $lngJ] = $polygon[$j];

            $crosses = (($lngI > $lng) !== ($lngJ > $lng))
                && $lat < (($latJ - $latI) * ($lng - $lngI)) / ($lngJ - $lngI) + $latI;

            if ($crosses) {
                $inside = !$inside;
            }
        }

        return $inside;
    }

    /**
     * Shortest distance (metres) from a point to a polygon's outline, using
     * an equirectangular projection — accurate to well under a metre at the
     * few-hundred-metre scale it's used for here.
     */
    public function distanceToPolygonMeters(float $lat, float $lng, array $polygon): float
    {
        $cosLat = cos(deg2rad($lat));
        $toXY = fn (float $la, float $lo) => [
            deg2rad($lo - $lng) * $cosLat * self::EARTH_RADIUS_METERS,
            deg2rad($la - $lat) * self::EARTH_RADIUS_METERS,
        ];

        $best = INF;
        $n = count($polygon);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            [$ax, $ay] = $toXY($polygon[$j][0], $polygon[$j][1]);
            [$bx, $by] = $toXY($polygon[$i][0], $polygon[$i][1]);

            $dx = $bx - $ax;
            $dy = $by - $ay;
            $len2 = $dx * $dx + $dy * $dy;
            $t = $len2 > 0 ? max(0, min(1, (-$ax * $dx - $ay * $dy) / $len2)) : 0;
            $px = $ax + $t * $dx;
            $py = $ay + $t * $dy;

            $best = min($best, sqrt($px * $px + $py * $py));
        }

        return $best;
    }

    private function result(string $status, bool $ok, string $message, ?string $detectedBarangay = null): array
    {
        return [
            'status'            => $status,
            'ok'                => $ok,
            'message'           => $message,
            'detected_barangay' => $detectedBarangay,
        ];
    }
}
