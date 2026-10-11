<?php

return [
    // Farm visits: morning, noon, afternoon. Stored timestamps stay in UTC.
    'timezone' => 'Asia/Manila',
    'critical_reminder_times' => ['07:00', '12:00', '17:00'],
    // Allow a late upload/check shortly after each visit time, not overnight catch-up.
    'reminder_window_minutes' => 30,
    'minimum_repeat_minutes' => 30,
    'warning_cooldown_minutes' => 30,
    'retry_minutes' => 5,
    // Longer than the HTTP timeout; a missing response is never blindly retried.
    'in_flight_timeout_seconds' => 120,
];
