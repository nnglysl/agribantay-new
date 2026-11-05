<?php

// Only for the explicit legacy-MySQL regression invocation, never production.
if (! preg_match('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', getenv('DB_DATABASE') ?: '')
    || ! in_array(getenv('DB_HOST'), ['localhost', '127.0.0.1', '::1'], true)
    || getenv('DB_CONNECTION') !== 'mysql' || getenv('DB_URL')) {
    throw new RuntimeException('Phase 4 regression connection is not an isolated local fixture.');
}
require dirname(__DIR__, 2).'/vendor/autoload.php';
