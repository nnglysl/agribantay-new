<?php

return [
    // Enabling delivery and choosing its transition date require separate
    // operational approval. Neither is inferred from deployment or today's date.
    'notifications_enabled' => (bool) env('ANNUAL_CLEANOUT_NOTIFICATIONS_ENABLED', false),
    'notification_start_date' => env('ANNUAL_CLEANOUT_NOTIFICATION_START_DATE'),
];
