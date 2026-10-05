<?php

/*
|--------------------------------------------------------------------------
| AgriBantay — fill the Overdue Maintenance screen
|--------------------------------------------------------------------------
|
| Hostinger has no SSH, so this runs the seeding command over HTTP, the same
| way seed-barangay-farms.php and refresh-caches.php run theirs.
|
| WHAT IT DOES: 'Overdue' and 'Non-Compliant' are not stored anywhere — they
| are worked out from the farm's last clean-out, or from its registration date
| when none was ever logged. So the command backdates registration on farms
| that have never logged a clean-out, then moves everything that states that
| same date to agree with it: the owner account, the Activity Log entry that
| announced the registration, and the maintenance notification trail.
|
| WHY THE NOTIFICATION TRAIL MATTERS: CheckMaintenanceCompliance runs daily at
| 08:00 and sends a REAL SMS, through the paid gateway, to every Overdue or
| Non-Compliant farm. Those mobile numbers are seeded, not real owners', so
| without the notification rows this would text a hundred strangers and bury
| every admin's notification bell. The rows are what make the job skip them.
|
| HOW TO USE
|
|   1. Set SECRET_TOKEN below to your own random string. It will NOT run
|      until you do.
|   2. BACK UP first. This edits existing rows in farms, users and
|      activity_logs — phpMyAdmin -> Export those three tables.
|   3. Upload this file to public_html.
|   4. DRY RUN — lists every farm it would touch, writes nothing:
|        https://agribantay.com/seed-overdue-maintenance.php?token=YOUR_TOKEN
|   5. Check the list. When it looks right, add &confirm=WRITE:
|        https://agribantay.com/seed-overdue-maintenance.php?token=YOUR_TOKEN&confirm=WRITE
|   6. DELETE THIS FILE from public_html.
|
| Re-running is safe: the picks are deterministic, the dates recompute to the
| same values, and the notification rows are guarded by their unique key. Each
| run does add its own Activity Log entry, which is correct — each run is a
| real action.
|
| To aim at a different number, add &target=50 (default 100).
|
*/

const SECRET_TOKEN = 'CHANGE_ME_BEFORE_UPLOADING';

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

echo "AgriBantay — Overdue Maintenance data\n";
echo str_repeat('=', 60), "\n\n";

// ----------------------------------------------------------------- 3. RUN

// Nothing is written unless the URL says WRITE in full, so a mistyped or
// shared link cannot move a hundred registration dates by itself.
$write  = isset($_GET['confirm']) && $_GET['confirm'] === 'WRITE';
$target = isset($_GET['target']) ? (int) $_GET['target'] : 100;

if ($target < 1 || $target > 1000) {
    http_response_code(400);
    exit("target must be between 1 and 1000.\n");
}

$options = ['--target' => $target];

if ($write) {
    $options['--force'] = true;
}

try {
    $exitCode = Illuminate\Support\Facades\Artisan::call('maintenance:seed-overdue', $options);
    echo trim(Illuminate\Support\Facades\Artisan::output()), "\n\n";
} catch (Throwable $e) {
    http_response_code(500);
    exit('ERROR: ' . $e->getMessage() . "\n");
}

echo str_repeat('=', 60), "\n";

if (!$write) {
    echo "DRY RUN — nothing was saved.\n\n";
    echo "If the list above is right, run it again with &confirm=WRITE on the end.\n";
    echo "BACK UP farms, users and activity_logs first — this edits existing rows.\n";
    exit(0);
}

if ($exitCode !== 0) {
    echo "The command reported a problem (exit {$exitCode}). Nothing further was done.\n";
    exit(1);
}

echo "DONE. No SMS was sent to anyone.\n\n";
echo "Check it by hand:\n";
echo "  1. Maintenance -> Overdue Maintenance. The count matches the target and\n";
echo "     both Overdue and Non-Compliant appear in the Status column.\n";
echo "  2. Open Joana's Farm. 'Last Performed' reads 'Never logged', the\n";
echo "     registration date is older than the clean-out interval, and the\n";
echo "     notification history lists the reminder (and the non-compliance\n";
echo "     notice if its grace period has passed).\n";
echo "     Delivery status shows 'Unknown' — correct: no SMS was ever sent, so\n";
echo "     there is no delivery record to show.\n";
echo "  3. Farms -> Active Farms. 'Date Registered' on those farms matches the\n";
echo "     date the Maintenance screen is counting from.\n";
echo "  4. Reports. The compliance summary totals agree with the screen.\n";
echo "  5. Gly's Farm and GEO'S FARM are still Compliant and untouched.\n\n";
echo "NOW DELETE THIS FILE from public_html.\n";
