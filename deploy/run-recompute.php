<?php

/*
|--------------------------------------------------------------------------
| run-recompute.php — re-derive stored readings after a recalibration
|--------------------------------------------------------------------------
|
| WHAT THIS IS FOR
|
| Every reading stores the raw ADC counts it was computed from
| (sensor_readings.ammonia_raw and .soil_raw). When a device is calibrated —
| a new reference pair, a new clean-air baseline, a new moisture fit — the
| readings ALREADY recorded were computed with the old constants and are now
| inconsistent with the new ones.
|
| `calibration:recompute` fixes that: it re-derives ppm and moisture from the
| stored raw counts, so a calibration taken today applies to everything the
| device has recorded since the raw columns were added.
|
| Hostinger has no reliable SSH, so this script boots Laravel over HTTP and
| calls the command for you. Same pattern as the other tools in deploy/.
|
| HOW TO USE
|   1. Set SECRET_TOKEN below to your own random string.
|   2. Upload to public_html/
|   3. DRY RUN first — nothing is written:
|        https://agribantay.com/run-recompute.php?token=YOUR_TOKEN
|   4. Read the summary. If the numbers look right, APPLY:
|        https://agribantay.com/run-recompute.php?token=YOUR_TOKEN&force=1
|   5. DELETE THIS FILE from public_html afterwards.
|
| ONE DEVICE AT A TIME (optional):
|        ...?token=YOUR_TOKEN&device=AGB-D01
|        ...?token=YOUR_TOKEN&device=AGB-D01&force=1
|   With no &device, every device is recomputed.
|
| SAFETY
|   - Dry run is the DEFAULT. You must pass &force=1 to write anything.
|   - alert_history is never touched. Recomputing a value does not invent or
|     retract an incident.
|   - Rows with no raw count at all are left exactly as they are.
|   - config:clear runs first, so the .env you just edited is actually read.
|     Without it a cached config means Laravel never loads .env and nothing
|     appears to change.
|
| NOTE: this recomputes BOTH ammonia and moisture for the devices it covers.
| There is no per-metric switch. That is harmless when both calibrations are
| settled — the values simply get rewritten to the same numbers.
*/

const SECRET_TOKEN = 'CHANGE_ME_BEFORE_UPLOADING';

header('Content-Type: text/plain; charset=utf-8');

if (SECRET_TOKEN === 'CHANGE_ME_BEFORE_UPLOADING' || SECRET_TOKEN === '') {
    http_response_code(403);
    exit("Refusing to run: open this file and set SECRET_TOKEN to your own value first.\n");
}

if (!isset($_GET['token']) || !hash_equals(SECRET_TOKEN, (string) $_GET['token'])) {
    http_response_code(403);
    exit("Forbidden.\n");
}

// ------------------------------------------------------------- BOOT LARAVEL
// The Laravel app lives OUTSIDE public_html (one level up). If your layout
// differs, fix this one line.
$basePath = __DIR__ . '/../backend';

if (!is_file($basePath . '/vendor/autoload.php')) {
    http_response_code(500);
    exit("Could not find Laravel at: {$basePath}\nFix \$basePath in this file.\n");
}

require $basePath . '/vendor/autoload.php';

$app = require $basePath . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$force  = isset($_GET['force']) && $_GET['force'] === '1';
$device = isset($_GET['device']) && $_GET['device'] !== '' ? (string) $_GET['device'] : null;

echo "AgriBantay — calibration recompute\n";
echo str_repeat('=', 64), "\n\n";
echo "Laravel base path : ", realpath($basePath) ?: $basePath, "\n";
echo "Mode              : ", $force ? "APPLY (values will be rewritten)" : "DRY RUN (nothing is written)", "\n";
echo "Device            : ", $device ?? '(all devices)', "\n\n";

// ------------------------------------------------- 1. MAKE .env READABLE
// A cached config means Laravel stops loading .env entirely, so a freshly
// edited calibration would be invisible. Clear it before anything reads it.
echo ">>> php artisan config:clear\n";

try {
    Illuminate\Support\Facades\Artisan::call('config:clear');
    echo trim(Illuminate\Support\Facades\Artisan::output()), "\n--- OK\n\n";
} catch (Throwable $e) {
    echo "--- FAILED: ", $e->getMessage(), "\n\n";
    exit("Stopping. Nothing was recomputed.\n");
}

// --------------------------------------- 2. SHOW WHICH CALIBRATION IS LIVE
// If this says a device is not calibrated, the .env entry is missing or
// misspelled — recomputing would just rewrite the old placeholder values.
echo "Calibration in force right now\n";
echo str_repeat('-', 64), "\n";

try {
    $service = $app->make(App\Services\SensorCalibrationService::class);
    $names = App\Models\Sensor::query()->get()
        ->map(fn ($s) => $s->device_name)
        ->filter()
        ->unique()
        ->values();

    if ($names->isEmpty()) {
        echo "  (no devices registered)\n";
    }

    foreach ($names as $name) {
        printf(
            "  %-10s ammonia: %-14s moisture: %s\n",
            $name,
            $service->ammoniaIsCalibrated($name) ? 'calibrated' : 'PLACEHOLDER',
            $service->moistureIsCalibrated($name) ? 'calibrated' : 'PLACEHOLDER'
        );
    }
} catch (Throwable $e) {
    echo "  (could not read calibration state: ", $e->getMessage(), ")\n";
}

echo "\n";

// ------------------------------------------------------------ 3. RECOMPUTE
$options = [];

if ($device !== null) {
    $options['--device'] = $device;
}

if ($force) {
    $options['--force'] = true;
}

$printable = 'php artisan calibration:recompute'
    . ($device !== null ? " --device={$device}" : '')
    . ($force ? ' --force' : '');

echo ">>> {$printable}\n";
echo str_repeat('-', 64), "\n";

try {
    Illuminate\Support\Facades\Artisan::call('calibration:recompute', $options);
    echo Illuminate\Support\Facades\Artisan::output(), "\n";
} catch (Throwable $e) {
    echo "--- FAILED: ", $e->getMessage(), "\n";
    echo "\nIf this says the command does not exist, upload\n";
    echo "  backend/app/Console/Commands/RecomputeCalibration.php\n";
    echo "to the server first.\n";
    exit;
}

echo str_repeat('=', 64), "\n";

if (!$force) {
    echo "That was a DRY RUN — nothing was written.\n\n";
    echo "If the numbers above look right, run it again with &force=1 :\n";
    echo "  ?token=YOUR_TOKEN", $device !== null ? "&device={$device}" : '', "&force=1\n";
} else {
    echo "Done. Values rewritten; alert_history was not touched.\n\n";
    echo "DELETE this file from public_html now.\n";
}
