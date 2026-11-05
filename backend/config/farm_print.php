<?php

return [
    'batch_size' => 500,
    // Explicit browser-memory safeguard, not a silent query truncation.
    // Oversized selections fail before retrieval and ask for a narrower range.
    'max_preview_rows' => 20000,
    'ticket_minutes' => 30,
];
