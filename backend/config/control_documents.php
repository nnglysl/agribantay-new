<?php

return [
    // Match the current attachment default; hosting PHP limits must allow it.
    'max_kb' => max(1, (int) env('CONTROL_DOCUMENT_MAX_KB', 5120)),
];
