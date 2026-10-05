<?php
/*
|-----------------------------------------------------------------------------
| AgriBantay — one-time migration + cache-clear runner
|-----------------------------------------------------------------------------
|
| WHY THIS EXISTS
| Hostinger shared hosting has no reliable SSH/terminal on every plan, so
| `php artisan migrate` cannot always be typed. This boots the same Laravel
| application over HTTP and runs the exact same artisan commands.
|
| WHERE IT GOES
|   public_html/run-migrate.php
|
| HOW TO USE
|   1. Open the SECRET_TOKEN line below and replace it with your own random
|      string. It will NOT run until you do.
|   2. Upload this file to public_html/.
|   3. Visit:  https://agribantay.com/run-migrate.php?token=YOUR_TOKEN
|   4. Read the output. It prints what each command did.
|   5. DELETE THIS FILE from public_html immediately afterwards.
|
| SAFETY
| - Refuses to run without a matching token, so a stray visitor cannot
|   trigger it.
| - Runs migrate WITHOUT --seed and WITHOUT fresh/refresh/reset, so it can
|   only ADD the new column. It can never drop a table or wipe rows.
| - Prints Laravel's own output rather than guessing at success.
|
| This file is a deployment tool. It is NOT part of the application and must
| not be left on the server.
*/

// ----------------------------------------------------------------- 1. TOKEN
// Replace this with your own random string before uploading.
const SECRET_TOKEN = 'agb-f5gyejaf';

header('Content-Type: text/plain; charset=utf-8');

if (SECRET_TOKEN === 'CHANGE_ME_BEFORE_UPLOADING' || SECRET_TOKEN === '') {
    http_response_code(403);
    exit("Refusing to run: open this file and set SECRET_TOKEN to your own value first.\n");
}

if (!isset($_GET['token']) || !hash_equals(SECRET_TOKEN, (string) $_GET['token'])) {
    http_response_code(403);
    exit("Forbidden.\n");
}

// ------------------------------------------------------------ 2. BOOT LARAVEL
// The Laravel app lives OUTSIDE public_html (one level up), which is why the
// path is ../backend. If your layout differs, fix this one line.
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

// ------------------------------------------------------- 2b. PRE-FLIGHT CHECK
// "Nothing to migrate" is ambiguous: it means the same thing whether the
// migration already ran or the file was never uploaded. This says which,
// before anything runs, so a missing upload is not mistaken for success.
echo "AgriBantay deployment runner\n";
echo str_repeat('=', 60), "\n\n";
echo "Laravel base path : ", realpath($basePath) ?: $basePath, "\n";

$migrationDir = $basePath . '/database/migrations';
$targetName   = '2026_09_25_210000_add_sensor_id_to_alert_history_table';
$targetFile   = $migrationDir . '/' . $targetName . '.php';

echo "Migrations folder : ", realpath($migrationDir) ?: '(MISSING)', "\n";
echo "Target migration  : ", is_file($targetFile) ? "FOUND on disk\n" : "NOT ON THE SERVER  <-- upload it\n";

try {
    $alreadyRecorded = Illuminate\Support\Facades\DB::table('migrations')
        ->where('migration', $targetName)
        ->exists();
    echo "Recorded as run   : ", $alreadyRecorded ? "YES\n" : "no\n";
} catch (Throwable $e) {
    echo "Recorded as run   : could not check (", $e->getMessage(), ")\n";
}

// A migration recorded as run while its column is absent means an earlier
// attempt was logged without finishing. Clearing the row lets it run again;
// nothing else in the table is touched.
try {
    $columnExists = Illuminate\Support\Facades\Schema::hasColumn('alert_history', 'sensor_id');
    if (!empty($alreadyRecorded) && !$columnExists) {
        Illuminate\Support\Facades\DB::table('migrations')->where('migration', $targetName)->delete();
        echo "  -> recorded but column missing; cleared the row so it can re-run\n";
    }
} catch (Throwable $e) {
    // Non-fatal — migrate below will surface any real problem.
}

echo "\n";

if (!is_file($targetFile)) {
    echo str_repeat('=', 60), "\n";
    echo "STOPPING. The migration file is not on the server.\n\n";
    echo "Upload this file:\n";
    echo "  backend/database/migrations/{$targetName}.php\n\n";
    echo "It must land in the folder printed above, then run this again.\n";
    exit;
}

// --------------------------------------------------------- 3. RUN THE COMMANDS
// Order matters: clear the compiled config/route caches FIRST, so migrate reads
// the live .env rather than a stale cached copy, then clear again at the end so
// the new routes are picked up.
$commands = [
    ['config:clear', []],
    ['route:clear',  []],
    ['cache:clear',  []],
    ['migrate',      ['--force' => true]],
    ['config:clear', []],
    ['route:clear',  []],
];

foreach ($commands as [$command, $options]) {
    echo ">>> php artisan {$command}\n";

    try {
        $exitCode = Illuminate\Support\Facades\Artisan::call($command, $options);
        echo trim(Illuminate\Support\Facades\Artisan::output()), "\n";
        echo $exitCode === 0 ? "--- OK\n\n" : "--- FAILED (exit {$exitCode})\n\n";
    } catch (Throwable $e) {
        echo '--- ERROR: ', $e->getMessage(), "\n\n";
    }
}

// ------------------------------------------------------------- 4. VERIFY
// Proves the thing this deploy was actually for, instead of trusting that
// "migrated" means the column is really there.
echo str_repeat('=', 60), "\n";
echo "Verification\n\n";

try {
    $hasColumn = Illuminate\Support\Facades\Schema::hasColumn('alert_history', 'sensor_id');
    echo 'alert_history.sensor_id exists: ', $hasColumn ? "YES\n" : "NO  <-- migration did not apply\n";
} catch (Throwable $e) {
    echo 'Could not check the column: ', $e->getMessage(), "\n";
}

echo "\nDone. DELETE this file from public_html now.\n";
