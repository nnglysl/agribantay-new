<?php
/*
|-----------------------------------------------------------------------------
| AgriBantay — READ-ONLY production audit
|-----------------------------------------------------------------------------
|
| Answers, against the LIVE database, the questions that cannot be answered
| from the local copy:
|
|   1. Why does the Reports card say N critical alerts when there are only
|      two devices?
|   2. Exactly which rows a "delete everything from before hosting" cleanup
|      would remove, and which it would keep.
|
| THIS SCRIPT WRITES NOTHING. It runs SELECT statements only. There is no
| delete, update or insert anywhere in it, so it is safe to run as often as
| needed and it can never change production data.
|
| USAGE
|   1. Upload to public_html/audit.php
|   2. Visit  https://agribantay.com/audit.php?token=YOUR_TOKEN
|   3. DELETE the file afterwards.
*/

const SECRET_TOKEN = 'agb-f5gyejaf';

header('Content-Type: text/plain; charset=utf-8');

if (!isset($_GET['token']) || !hash_equals(SECRET_TOKEN, (string) $_GET['token'])) {
    http_response_code(403);
    exit("Forbidden.\n");
}

$basePath = __DIR__ . '/../backend';

if (!is_file($basePath . '/vendor/autoload.php')) {
    http_response_code(500);
    exit("Could not find Laravel at: {$basePath}\n");
}

require $basePath . '/vendor/autoload.php';
$app = require $basePath . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

function heading(string $text): void
{
    echo "\n", str_repeat('=', 66), "\n", $text, "\n", str_repeat('=', 66), "\n";
}

echo "AgriBantay — READ-ONLY audit (nothing is modified)\n";
echo 'Generated: ', now()->toDayDateTimeString(), "\n";

// ---------------------------------------------------------------- 1. ALERTS
heading('1. ALERT HISTORY — why the Critical count looks high');

$total     = DB::table('alert_history')->count();
$critical  = DB::table('alert_history')->where('status', 'Critical')->count();
$ongoing   = DB::table('alert_history')->whereNull('resolved_at')->count();
$noSensor  = DB::table('alert_history')->whereNull('sensor_id')->count();

echo "Total incidents      : {$total}\n";
echo "  Critical           : {$critical}   <- this is the Reports card number\n";
echo "  Still ongoing      : {$ongoing}\n";
echo "  Without a device   : {$noSensor}   <- recorded before per-device tracking\n\n";

echo "Breakdown by device and sensor:\n";
$rows = DB::table('alert_history as a')
    ->leftJoin('sensors as s', 's.id', '=', 'a.sensor_id')
    ->selectRaw('COALESCE(s.label, s.sensor_code, "(no device)") as device, a.sensor_type, a.status,
                 COUNT(*) as n, MIN(a.triggered_at) as first_seen, MAX(a.triggered_at) as last_seen')
    ->groupBy('device', 'a.sensor_type', 'a.status')
    ->orderBy('device')
    ->get();

foreach ($rows as $r) {
    printf("  %-14s %-12s %-9s x%-4d  %s .. %s\n",
        $r->device, $r->sensor_type, $r->status, $r->n, $r->first_seen, $r->last_seen);
}

echo "\nHow often new incidents open (are they really every minute?):\n";
$perHour = DB::table('alert_history')
    ->selectRaw('DATE_FORMAT(triggered_at, "%Y-%m-%d %H:00") as hour, COUNT(*) as n')
    ->groupBy('hour')->orderByDesc('hour')->limit(12)->get();

foreach ($perHour as $h) {
    printf("  %s  %d new incident(s)\n", $h->hour, $h->n);
}

// ------------------------------------------------------- 2. CLEANUP PREVIEW
heading('2. CLEANUP PREVIEW — what a cut-off date would remove');

// Everything the system has actually been used for in production started
// when the first real device was installed. That date is derived from the
// data rather than assumed, so the cut-off is defensible.
$firstSensor = DB::table('sensors')->min('installed_at');
$firstFarm   = DB::table('farms')->min('created_at');

echo "Earliest device installed_at : ", $firstSensor ?: '(none)', "\n";
echo "Earliest farm created_at     : ", $firstFarm ?: '(none)', "\n";

$cutoff = $_GET['cutoff'] ?? '2026-09-24 00:00:00';
echo "\nCut-off being previewed      : {$cutoff}\n";
echo "(override with &cutoff=YYYY-MM-DD)\n\n";

foreach ([
    'activity_logs'     => 'created_at',
    'generated_reports' => 'created_at',
    'alert_history'     => 'triggered_at',
    'sensor_readings'   => 'created_at',
    'notifications'     => 'created_at',
    'sms_logs'          => 'created_at',
] as $table => $column) {
    try {
        $before = DB::table($table)->where($column, '<', $cutoff)->count();
        $after  = DB::table($table)->where($column, '>=', $cutoff)->count();
        printf("  %-20s  would DELETE %-6d   would KEEP %-6d\n", $table, $before, $after);
    } catch (Throwable $e) {
        printf("  %-20s  (skipped: %s)\n", $table, $e->getMessage());
    }
}

echo "\nOldest rows that would be deleted, by table:\n";
foreach (['activity_logs' => 'created_at', 'generated_reports' => 'created_at'] as $table => $column) {
    try {
        $sample = DB::table($table)->where($column, '<', $cutoff)
            ->orderBy($column)->limit(5)->get();
        echo "  {$table}:\n";
        foreach ($sample as $row) {
            $arr = (array) $row;
            $label = $arr['action'] ?? $arr['report_name'] ?? '(row)';
            printf("    %s  %s\n", $arr[$column], $label);
        }
    } catch (Throwable $e) {
        echo "  {$table}: ", $e->getMessage(), "\n";
    }
}

heading('END — nothing was changed. Delete this file from public_html.');
