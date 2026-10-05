<?php
/*
|-----------------------------------------------------------------------------
| AgriBantay — pre-deployment data cleanup
|-----------------------------------------------------------------------------
|
| Removes records created while the system was still running on localhost, so
| what the LGU sees is only what happened after the system went live.
|
| SAFETY
| - DRY RUN BY DEFAULT. Without &confirm=DELETE it only reports what it would
|   do and changes nothing.
| - Everything runs inside ONE transaction. Any error rolls the whole thing
|   back — there is no half-finished state.
| - Only three tables are touched: activity_logs, generated_reports, sms_logs.
|   Farms, users, sensors, sensor_readings, alert_history and notifications
|   are NEVER deleted by this script.
| - Prints before/after counts for every table so the result is verifiable
|   rather than assumed.
|
| USAGE
|   Preview :  /cleanup.php?token=TOKEN&cutoff=2026-09-23
|   Execute :  /cleanup.php?token=TOKEN&cutoff=2026-09-23&confirm=DELETE
|
| DELETE THIS FILE from public_html afterwards.
*/

const SECRET_TOKEN = 'agb-f5gyejaf';

header('Content-Type: text/plain; charset=utf-8');

if (!isset($_GET['token']) || !hash_equals(SECRET_TOKEN, (string) $_GET['token'])) {
    http_response_code(403);
    exit("Forbidden.\n");
}

$basePath = __DIR__ . '/../backend';
require $basePath . '/vendor/autoload.php';
$app = require $basePath . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$cutoff  = ($_GET['cutoff'] ?? '2026-09-23') . ' 00:00:00';
$confirm = ($_GET['confirm'] ?? '') === 'DELETE';

// Tables cleaned, and the column that decides whether a row is pre-launch.
// Deliberately excludes anything that holds real monitoring history.
$targets = [
    'activity_logs'     => 'created_at',
    'generated_reports' => 'created_at',
    'sms_logs'          => 'created_at',
];

echo "AgriBantay — data cleanup\n";
echo str_repeat('=', 66), "\n";
echo 'Mode   : ', $confirm ? "EXECUTE (rows will be deleted)\n" : "DRY RUN (nothing will change)\n";
echo "Cutoff : {$cutoff}\n";
echo "         rows older than this are removed; everything newer is kept\n\n";

// ------------------------------------------------------------- 1. BEFORE
echo "BEFORE\n";
$before = [];
foreach ($targets as $table => $column) {
    $before[$table] = [
        'total'  => DB::table($table)->count(),
        'delete' => DB::table($table)->where($column, '<', $cutoff)->count(),
    ];
    printf("  %-20s total %-6d  to delete %-6d\n", $table, $before[$table]['total'], $before[$table]['delete']);
}

// Proof that the monitoring record is untouched — these are counted before
// and after so the numbers can be compared, but never deleted.
$protected = ['farms', 'users', 'sensors', 'sensor_readings', 'alert_history', 'notifications'];
echo "\nProtected (never deleted by this script)\n";
$protectedBefore = [];
foreach ($protected as $table) {
    $protectedBefore[$table] = DB::table($table)->count();
    printf("  %-20s %d\n", $table, $protectedBefore[$table]);
}

if (!$confirm) {
    echo "\n", str_repeat('=', 66), "\n";
    echo "DRY RUN — nothing was changed.\n";
    echo "To execute, add  &confirm=DELETE  to the URL.\n";
    exit;
}

// ------------------------------------------------------------- 2. EXECUTE
echo "\n", str_repeat('=', 66), "\n";
echo "EXECUTING inside a transaction...\n\n";

try {
    DB::transaction(function () use ($targets, $cutoff) {
        foreach ($targets as $table => $column) {
            $n = DB::table($table)->where($column, '<', $cutoff)->delete();
            printf("  deleted %-6d from %s\n", $n, $table);
        }
    });
    echo "\nTransaction committed.\n";
} catch (Throwable $e) {
    echo "\nFAILED — everything was rolled back. No rows were deleted.\n";
    echo 'Reason: ', $e->getMessage(), "\n";
    exit;
}

// -------------------------------------------------------------- 3. AFTER
echo "\nAFTER\n";
foreach ($targets as $table => $column) {
    $remaining = DB::table($table)->count();
    $stragglers = DB::table($table)->where($column, '<', $cutoff)->count();
    printf("  %-20s total %-6d  older than cutoff %-6d %s\n",
        $table, $remaining, $stragglers, $stragglers === 0 ? '' : '<-- UNEXPECTED');
}

echo "\nProtected tables — must be identical to BEFORE\n";
$ok = true;
foreach ($protected as $table) {
    $now = DB::table($table)->count();
    $same = $now === $protectedBefore[$table];
    if (!$same) { $ok = false; }
    printf("  %-20s %-6d %s\n", $table, $now, $same ? 'unchanged' : '<-- CHANGED, INVESTIGATE');
}

echo "\n", str_repeat('=', 66), "\n";
echo $ok
    ? "Done. Monitoring data is intact. Delete this file from public_html.\n"
    : "Done, but a protected table changed. Investigate before continuing.\n";
