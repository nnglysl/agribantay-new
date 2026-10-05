<?php
/*
|-----------------------------------------------------------------------------
| AgriBantay — one-off cleanup: farm owners left with no farm
|-----------------------------------------------------------------------------
|
| WHY THIS EXISTS
| Deleting a farm now also deletes its owner when that was their last one.
| Deletions made BEFORE that rule shipped removed only the farm, so those
| owners are still in `users` with zero farms — able to sign in and land on an
| empty dashboard. This removes exactly those accounts.
|
| It is a one-off. Once run, new deletions keep themselves tidy and this file
| has no further purpose.
|
| HOW TO USE
|   1. Set SECRET_TOKEN below. It will NOT run until you do.
|   2. Upload to public_html/.
|   3. Visit:  https://agribantay.com/prune-orphan-owners.php?token=YOUR_TOKEN
|      This only LISTS the accounts. Nothing is changed.
|   4. Read the list. If it is what you expect, visit the same URL with
|      &confirm=DELETE added to actually remove them.
|   5. DELETE THIS FILE from public_html immediately afterwards.
|
| SAFETY
| - Refuses to run without a matching token.
| - Lists by default; deleting needs a second, explicit visit.
| - Only touches users whose role is farm_owner AND who have zero farms. An
|   owner with even one farm — of any status — is never touched.
| - Records what it removed in the Activity Log.
*/

// ----------------------------------------------------------------- 1. TOKEN
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

// ------------------------------------------------------------ 2. BOOT LARAVEL
$basePath = __DIR__ . '/../backend';

if (!is_file($basePath . '/vendor/autoload.php')) {
    http_response_code(500);
    exit("Could not find Laravel at: {$basePath}\nFix \$basePath in this file.\n");
}

require $basePath . '/vendor/autoload.php';

/** @var \Illuminate\Foundation\Application $app */
$app = require $basePath . '/bootstrap/app.php';

$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

echo "AgriBantay — orphaned farm owner cleanup\n";
echo str_repeat('=', 60), "\n\n";

// The command must be on the server for this to do anything.
if (! class_exists(\App\Console\Commands\PruneOrphanFarmOwners::class)) {
    echo "STOPPING. app/Console/Commands/PruneOrphanFarmOwners.php is not on the server.\n";
    echo "Upload it, then run this again.\n";
    exit;
}

// ------------------------------------------------------- 3. LIST, THEN DELETE
// The confirm value is spelled out rather than a 1, so the destructive run
// cannot be reached by idly editing the URL.
$confirmed = ($_GET['confirm'] ?? '') === 'DELETE';

if (! $confirmed) {
    echo "DRY RUN — nothing will be changed.\n\n";
}

try {
    Illuminate\Support\Facades\Artisan::call(
        'farms:prune-orphan-owners',
        $confirmed ? ['--force' => true] : []
    );

    echo trim(Illuminate\Support\Facades\Artisan::output()), "\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "ERROR: ", $e->getMessage(), "\n";
    exit;
}

echo "\n", str_repeat('=', 60), "\n";

if ($confirmed) {
    echo "Done. NOW DELETE THIS FILE from public_html.\n";
} else {
    echo "This was a dry run.\n\n";
    echo "If the list above is what you expect, run it again with:\n";
    echo "  ?token=YOUR_TOKEN&confirm=DELETE\n";
}

echo "\n";
