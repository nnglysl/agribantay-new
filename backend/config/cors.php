<?php

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // Local Vite dev server, plus the deployed frontend. FRONTEND_URL is set
    // per-environment (in the server's .env) rather than hardcoded, so the
    // production origin can change without a code edit.
    'allowed_origins' => array_filter([
        'http://localhost:5173',
        env('FRONTEND_URL'),
    ]),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];