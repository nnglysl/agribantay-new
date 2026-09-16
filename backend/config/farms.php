<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Duplicate farm location radius
    |--------------------------------------------------------------------------
    |
    | Two farms whose pinned coordinates are closer than this many metres are
    | treated as the same area, so a new/moved farm pin is rejected when it
    | lands within this distance of another registered farm. A plain
    | equality check on lat/lng would be useless — geocoding and marker
    | dragging never reproduce the exact same decimals. The frontend reads
    | this value from GET /admin/farms-map so both sides agree.
    |
    */

    'duplicate_location_radius_meters' => (int) env('FARM_DUPLICATE_RADIUS_METERS', 50),

    /*
    |--------------------------------------------------------------------------
    | Barangay <-> pin plausibility fallback
    |--------------------------------------------------------------------------
    |
    | Used only for barangays that have no boundary polygon in
    | config/geography.php (28 of 33). A pin is treated as CLEARLY not in the
    | selected barangay — and rejected — when it is farther than
    | barangay_max_distance_meters from the barangay's reference point, or
    | when it is at least barangay_far_min_meters away from that point AND
    | barangay_far_ratio times closer to some other barangay's reference
    | point. Anything less clear-cut is reported as "unverified" and allowed,
    | because rural OSM data is too sparse to reject it with confidence.
    | Barangay polygons get a small edge tolerance (barangay_edge_tolerance_
    | meters) so a pin a few metres past an imprecise OSM boundary line is
    | flagged rather than blocked.
    |
    */

    'barangay_max_distance_meters'   => (int) env('FARM_BARANGAY_MAX_DISTANCE_METERS', 3000),
    'barangay_far_min_meters'        => (int) env('FARM_BARANGAY_FAR_MIN_METERS', 1500),
    'barangay_far_ratio'             => (float) env('FARM_BARANGAY_FAR_RATIO', 3),
    'barangay_edge_tolerance_meters' => (int) env('FARM_BARANGAY_EDGE_TOLERANCE_METERS', 150),

];
