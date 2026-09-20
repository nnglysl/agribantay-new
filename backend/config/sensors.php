<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Device connectivity timeout
    |--------------------------------------------------------------------------
    |
    | A device counts as Online while its last accepted reading
    | (sensors.last_seen_at) is younger than this many minutes; otherwise it
    | is Offline. The firmware transmits roughly once every 60 seconds, so
    | 3 minutes tolerates two consecutive missed uploads (LTE hiccups) before
    | the farm is shown as Offline. This is the single source of truth — all
    | controllers/services read it from here.
    |
    */

    'offline_after_minutes' => (int) env('SENSOR_OFFLINE_AFTER_MINUTES', 3),

    /*
    |--------------------------------------------------------------------------
    | Manure moisture classification thresholds (%)
    |--------------------------------------------------------------------------
    |
    | AgriBantay's research-based operational rule (IoT Thresholds RRL):
    |
    |   Safe      < warning               (< 25%)
    |   Warning   >= warning, < critical  (25% - 34.99%)
    |   Critical  >= critical             (>= 35%)
    |
    | Read through App\Services\MoistureThresholdService — every place
    | that labels a moisture value goes through it, so these two numbers
    | are the single source of truth. Only NEW readings are classified
    | with them; historical moisture_status rows are never rewritten.
    |
    */

    'moisture' => [
        'warning'  => 25,
        'critical' => 35,
    ],

];
