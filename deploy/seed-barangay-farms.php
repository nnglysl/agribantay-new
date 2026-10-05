<?php

/*
|--------------------------------------------------------------------------
| AgriBantay — load a barangay's farm roster
|--------------------------------------------------------------------------
|
| Hostinger has no SSH, so this runs the seeding command over HTTP, the same
| way refresh-caches.php runs the cache commands.
|
| WHY THIS EXISTS: registering a farm owner through the UI sends an SMS
| carrying a temporary password. Keying in a roster by hand therefore texts
| every number in it — 49 such messages went out in one morning. This path
| creates the same records and sends nothing.
|
| HOW TO USE
|
|   1. Set SECRET_TOKEN below to your own random string. It will NOT run
|      until you do.
|   2. Upload this file to public_html.
|   3. DRY RUN first — shows what would be created, writes nothing:
|        https://agribantay.com/seed-barangay-farms.php?token=YOUR_TOKEN
|   4. Check the list. When it looks right, add &confirm=WRITE:
|        https://agribantay.com/seed-barangay-farms.php?token=YOUR_TOKEN&confirm=WRITE
|   5. DELETE THIS FILE from public_html.
|
| Re-running is safe: a farm whose name already exists in that barangay is
| skipped, never duplicated.
|
*/

const SECRET_TOKEN = 'CHANGE_ME_BEFORE_UPLOADING';

// The password every created owner gets. Change it before uploading if you
// would rather it were not in a file you are about to put on a web server.
const OWNER_PASSWORD = 'agribantay2026';

header('Content-Type: text/plain; charset=utf-8');

// ------------------------------------------------------------------ 1. GATE

if (SECRET_TOKEN === 'CHANGE_ME_BEFORE_UPLOADING' || SECRET_TOKEN === '') {
    http_response_code(500);
    exit("Refusing to run: open this file and set SECRET_TOKEN to your own value first.\n");
}

if (!isset($_GET['token']) || !hash_equals(SECRET_TOKEN, (string) $_GET['token'])) {
    http_response_code(404);
    exit("Not found.\n");
}

// ---------------------------------------------------------- 2. BOOT LARAVEL

$basePath = __DIR__ . '/../backend';

if (!is_file($basePath . '/vendor/autoload.php')) {
    http_response_code(500);
    exit("Could not find Laravel at: {$basePath}\nFix \$basePath in this file.\n");
}

require $basePath . '/vendor/autoload.php';

/** @var \Illuminate\Foundation\Application $app */
$app = require $basePath . '/bootstrap/app.php';

$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

echo "AgriBantay — barangay roster\n";
echo str_repeat('=', 60), "\n\n";

// ----------------------------------------------------------------- 3. RUN

// Nothing is written unless the URL says WRITE in full. A bare token gives a
// dry run, so a mistyped or shared link cannot create accounts by itself.
$write = isset($_GET['confirm']) && $_GET['confirm'] === 'WRITE';

$options = ['--password' => OWNER_PASSWORD];

if ($write) {
    $options['--force'] = true;
}

try {
    $exitCode = Illuminate\Support\Facades\Artisan::call('farms:seed-barangay', $options);
    echo trim(Illuminate\Support\Facades\Artisan::output()), "\n\n";
} catch (Throwable $e) {
    http_response_code(500);
    exit('ERROR: ' . $e->getMessage() . "\n");
}

echo str_repeat('=', 60), "\n";

if (!$write) {
    echo "DRY RUN — nothing was saved.\n\n";
    echo "If the list above is right, run it again with &confirm=WRITE on the end.\n";
    exit(0);
}

if ($exitCode !== 0) {
    echo "The command reported a problem (exit {$exitCode}). Nothing further was done.\n";
    exit(1);
}

echo "DONE. No SMS was sent to anyone.\n\n";
echo "Check it by hand:\n";
echo "  1. Farms -> Active Farms. The new farms are listed under Banay-banay II.\n";
echo "  2. Open one. The pin sits inside San Jose and the barangay notice is\n";
echo "     the grey 'close match' line, not a red mismatch.\n";
echo "  3. Monitoring Status reads 'Pending Setup' — correct, no device yet.\n\n";
echo "NOW DELETE THIS FILE from public_html.\n";
