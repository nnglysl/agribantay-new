<?php
/*
|-----------------------------------------------------------------------------
| AgriBantay — retire advisory-metric alert history
|-----------------------------------------------------------------------------
|
| Temperature and humidity no longer raise alerts. Their published thresholds
| come from temperate-climate studies, and a San Jose layer house sits at
| 32-37 C for most of the day, so they were leaving every farm permanently
| red. They are still measured, shown and fed to the recommendation engine —
| they simply no longer decide anything (see config/sensors.php).
|
| The rows they already wrote into alert_history are what this removes. Every
| one of them was produced on a workbench during pre-deployment testing — a
| probe dipped in water, a loose jumper wire, a room at 37 C — not by a farm.
|
| SAFETY
| - DRY RUN BY DEFAULT. Without &confirm=DELETE it reports and changes nothing.
| - Only alert_history is touched, and only rows whose sensor_type is in the
|   retired list. Ammonia and moisture incidents are never matched.
| - sensor_readings is NEVER touched: the temperature and humidity numbers
|   themselves stay, because they are real measurements. Only the INCIDENTS
|   raised from them are removed.
| - Runs inside ONE transaction, and verifies the protected counts before and
|   after so the result is checked rather than assumed.
|
| USAGE
|   Preview :  /retire-advisory-alerts.php?token=TOKEN
|   Execute :  /retire-advisory-alerts.php?token=TOKEN&confirm=DELETE
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

$confirm = ($_GET['confirm'] ?? '') === 'DELETE';

// Read the live config rather than hard-coding the pair, so this script can
// never disagree with what the application actually alerts on.
$alerting = config('sensors.alerting_metrics', ['ammonia']);
$all      = ['ammonia', 'temperature', 'humidity', 'moisture'];
$retired  = array_values(array_diff($all, $alerting));

echo "AgriBantay — retire advisory-metric alert history\n";
echo str_repeat('=', 66), "\n";
echo 'Mode     : ', $confirm ? "EXECUTE (rows will be deleted)\n" : "DRY RUN (nothing will change)\n";
echo 'Alerting : ', implode(', ', $alerting), "\n";
echo 'Retiring : ', $retired ? implode(', ', $retired) : '(none)', "\n\n";

if (!$retired) {
    exit("Every metric still raises alerts — nothing to retire.\n");
}

// What is about to go, broken down so the numbers can be sanity-checked
// before anything is deleted.
echo "Rows found in alert_history\n";
echo str_repeat('-', 66), "\n";

$total = 0;
foreach ($retired as $type) {
    $count    = DB::table('alert_history')->where('sensor_type', $type)->count();
    $ongoing  = DB::table('alert_history')->where('sensor_type', $type)->whereNull('resolved_at')->count();
    $total   += $count;
    printf("  %-14s %5d row(s)   (%d still open)\n", $type, $count, $ongoing);
}
printf("  %-14s %5d row(s)\n\n", 'TOTAL', $total);

// Counts that must come through untouched. Checked on both sides of the
// transaction, because "I only meant to delete X" is not evidence.
$protected = ['farms', 'users', 'sensors', 'sensor_readings', 'notifications'];
$before = [];
foreach ($protected as $table) {
    $before[$table] = DB::table($table)->count();
}
$before['alert_history_kept'] = DB::table('alert_history')->whereIn('sensor_type', $alerting)->count();

if (!$confirm) {
    echo "DRY RUN — nothing was changed.\n";
    echo "Re-run with &confirm=DELETE to remove the rows above.\n";
    exit;
}

if ($total === 0) {
    exit("Nothing to delete.\n");
}

DB::transaction(function () use ($retired, &$deleted) {
    $deleted = DB::table('alert_history')->whereIn('sensor_type', $retired)->delete();
});

echo "Deleted {$deleted} row(s) from alert_history.\n\n";

echo "Verification\n";
echo str_repeat('-', 66), "\n";

$ok = true;
foreach ($protected as $table) {
    $after  = DB::table($table)->count();
    $status = $after === $before[$table] ? 'unchanged' : 'CHANGED';
    if ($after !== $before[$table]) { $ok = false; }
    printf("  %-18s %6d -> %-6d %s\n", $table, $before[$table], $after, $status);
}

$keptAfter = DB::table('alert_history')->whereIn('sensor_type', $alerting)->count();
$keptOk    = $keptAfter === $before['alert_history_kept'];
if (!$keptOk) { $ok = false; }
printf("  %-18s %6d -> %-6d %s\n", 'ammonia+moisture', $before['alert_history_kept'], $keptAfter, $keptOk ? 'unchanged' : 'CHANGED');

$leftover = DB::table('alert_history')->whereIn('sensor_type', $retired)->count();
printf("  %-18s %6s    %s\n", 'retired remaining', $leftover, $leftover === 0 ? 'clean' : 'STILL PRESENT');
if ($leftover !== 0) { $ok = false; }

echo "\n", $ok ? "All checks passed.\n" : "CHECK FAILED — review the rows above.\n";
echo "DELETE this file from public_html now.\n";
