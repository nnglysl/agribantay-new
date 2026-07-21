<?php

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // Local Vite dev server, plus the deployed frontend. FRONTEND_URL is set
    // per-environment (Railway Variables) rather than hardcoded, so the
    // production origin can change without a code edit.
    'allowed_origins' => array_filter([
        'http://localhost:5173',
        env('FRONTEND_URL'),
    ]),

    // Vercel gives every branch and commit its own preview subdomain
    // (agribantay-new-<hash>-gly.vercel.app), so they can't be listed
    // individually — this pattern covers all of them.
    'allowed_origins_patterns' => [
        '#^https://.*\.vercel\.app$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];