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

];
