<?php

// Temporary Hostinger helper: upload to public_html, run once, then delete.
// Runs ONLY the nullable ammonia ADC millivolt migration, not all pending work.
const SECRET_TOKEN = 'CHANGE_ME_BEFORE_UPLOADING';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
if (SECRET_TOKEN === 'CHANGE_ME_BEFORE_UPLOADING' || SECRET_TOKEN === ''
    || ! is_string($_GET['token'] ?? null)
    || ! hash_equals(SECRET_TOKEN, $_GET['token'])) {
    http_response_code(403);
    exit("Forbidden: configure and supply the deployment token.\n");
}

$base = __DIR__.'/../backend';
$migration = 'database/migrations/2026_10_10_120000_add_ammonia_adc_mv_to_sensor_readings_table.php';
if (! is_file($base.'/vendor/autoload.php') || ! is_file($base.'/'.$migration)) {
    http_response_code(500);
    exit("Upload the migration to backend/database/migrations before running this helper.\n");
}

require $base.'/vendor/autoload.php';
$app = require $base.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

try {
    $exitCode = Illuminate\Support\Facades\Artisan::call('migrate', [
        '--path' => [$migration], '--force' => true,
    ]);
    echo Illuminate\Support\Facades\Artisan::output();
    if ($exitCode !== 0 || ! Illuminate\Support\Facades\Schema::hasColumn('sensor_readings', 'ammonia_adc_mv')) {
        http_response_code(500);
        exit("FAILED: do not upload the new controller until the column exists.\n");
    }
    echo "SUCCESS: sensor_readings.ammonia_adc_mv exists.\n";
    echo "Next: upload the model and controller, then flash the D02 firmware.\n";
    echo "No old readings were recomputed. DELETE this helper from public_html now.\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "Migration failed: ", $e->getMessage(), "\n";
}
