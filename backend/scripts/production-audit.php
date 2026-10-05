<?php
/**
 * AgriBantay — READ-ONLY production database audit.
 *
 * Run from the backend root on the deployed server:
 *     php scripts/production-audit.php
 *
 * It bootstraps the deployed application itself, so it always reports on the
 * SAME database the live site uses — there is no separate connection string to
 * get wrong. It prints a summary and writes a full per-record CSV next to it.
 *
 * SAFETY: this script issues SELECT statements only. It contains no DELETE,
 * UPDATE, INSERT, TRUNCATE or DROP, creates no migrations and no test database.
 * Verify that yourself before running it:
 *     grep -inE "delete|update|insert|truncate|drop|save\(" scripts/production-audit.php
 * Database credentials are never printed.
 */

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

function h(string $t): void { echo "\n" . str_repeat('=', 74) . "\n  $t\n" . str_repeat('=', 74) . "\n"; }

// ─────────────────────────────────────────────────────────────────────────
// STEP 1 — connection identity (no credentials printed)
// ─────────────────────────────────────────────────────────────────────────
h('STEP 1 — CONNECTION');
$conn = config('database.default');
echo "  APP_ENV            : " . config('app.env') . "\n";
echo "  APP_DEBUG          : " . (config('app.debug') ? 'true  <-- should be FALSE in production' : 'false') . "\n";
echo "  APP_URL            : " . config('app.url') . "\n";
echo "  Connection driver  : " . config("database.connections.$conn.driver") . "\n";
echo "  Database name      : " . DB::connection()->getDatabaseName() . "\n";
$host = config("database.connections.$conn.host");
echo "  Host is localhost  : " . (in_array($host, ['127.0.0.1', 'localhost'], true) ? 'yes (DB on same server as app)' : 'no (remote host)') . "\n";
try {
    DB::select('select 1');
    echo "  Connection status  : OK\n";
    echo "  Server version     : " . DB::select('select version() v')[0]->v . "\n";
    echo "  Server time        : " . DB::select('select now() n')[0]->n . "\n";
} catch (\Throwable $e) {
    exit("  Connection status  : FAILED — " . $e->getMessage() . "\n");
}
echo "\n  This is by definition the database the deployed app uses: the script\n";
echo "  boots the app's own config rather than a hand-entered connection.\n";

// ─────────────────────────────────────────────────────────────────────────
// STEP 2 — inventory
// ─────────────────────────────────────────────────────────────────────────
h('STEP 2a — USER ACCOUNTS (read-only; nothing is modified)');
foreach (DB::table('users')->select('role', 'status', DB::raw('COUNT(*) c'))->groupBy('role', 'status')->orderBy('role')->get() as $r) {
    echo "  {$r->role} / {$r->status} : {$r->c}\n";
}
echo "\n  Privileged accounts that MUST be preserved:\n";
foreach (DB::table('users')->whereIn('role', ['super_admin', 'admin', 'vet'])->orderBy('id')->get() as $u) {
    echo "    #{$u->id}  {$u->first_name} {$u->last_name}  [{$u->role}/{$u->status}]\n";
}
echo "  Farm owner accounts: " . DB::table('users')->where('role', 'farm_owner')->count() . "\n";

h('STEP 2b — FARM-RELATED DATA');
$farms = DB::table('farms')->orderBy('id')->get();
echo "  farms = " . $farms->count() . "\n";
foreach ($farms as $f) {
    echo "    #{$f->id}  \"{$f->farm_name}\"  owner_user_id={$f->user_id}  {$f->status}  created {$f->created_at}\n";
}
foreach (['poultry_houses','sensors','sensor_readings','inspections','service_requests','alert_history','maintenance_logs','maintenance_notifications','manure_disposal_records','recommendations','ai_recommendations','sms_logs'] as $t) {
    try { echo "  $t = " . DB::table($t)->count() . "\n"; } catch (\Throwable $e) { echo "  $t = (table not present)\n"; }
}

// Names used to decide whether a text reference points at a LIVE farm.
$liveFarmNames = $farms->pluck('farm_name')->filter()->values()->all();
$liveOwnerIds  = $farms->pluck('user_id')->filter()->unique()->all();
$liveOwnerNames = $liveOwnerIds
    ? DB::table('users')->whereIn('id', $liveOwnerIds)->selectRaw("CONCAT(first_name,' ',last_name) n")->pluck('n')->all()
    : [];
$userRole = DB::table('users')->pluck('role', 'id')->all();
$userName = DB::table('users')->selectRaw("id, CONCAT(first_name,' ',last_name) n")->pluck('n', 'id')->all();
$actor = function ($id) use ($userRole, $userName) {
    if ($id === null) return 'NULL (actor deleted; UI shows "System")';
    return "#$id " . ($userName[$id] ?? '?') . ' (' . ($userRole[$id] ?? '?') . ')';
};

/** Does this free text name a farm (or farm owner) that still exists? */
$mentionsLiveFarm = function (string $text) use ($liveFarmNames, $liveOwnerNames) {
    foreach (array_merge($liveFarmNames, $liveOwnerNames) as $n) {
        if ($n !== '' && stripos($text, $n) !== false) return $n;
    }
    return null;
};
/** Pull the farm-ish name a row refers to, for the report column. */
$referenced = function (string $text) {
    if (preg_match('/"([^"]+)"/u', $text, $m)) return $m[1];
    if (preg_match('/—\s*([^—|]+?)\s*$/u', $text, $m)) return trim($m[1]);
    if (preg_match('/\b([A-Z][\w\'\-]*(?:\s+[A-Z][\w\'\-]*)*\s+(?:Farm|Poultry|Layers|Egg Farm))\b/u', $text, $m)) return trim($m[1]);
    return '';
};

$csvPath = __DIR__ . '/production-audit-' . date('Ymd-His') . '.csv';
$out = fopen($csvPath, 'w');
fputcsv($out, ['bucket','table','id','user_id','actor','type','title_or_action','message_or_details','created_at','references','safe_to_consider','reason']);

$tally = ['A' => 0, 'B' => 0, 'C' => 0, 'D' => 0];
$rowsByBucket = ['A' => [], 'B' => [], 'C' => [], 'D' => []];
$add = function ($bucket, $row) use ($out, &$tally, &$rowsByBucket) {
    $tally[$bucket]++; $rowsByBucket[$bucket][] = $row; fputcsv($out, array_merge([$bucket], $row));
};

// ── NOTIFICATIONS ────────────────────────────────────────────────────────
h('STEP 2c — NOTIFICATIONS');
$notifs = DB::table('notifications')->orderBy('id')->get();
echo "  total = " . $notifs->count() . "\n\n  By recipient and type:\n";
foreach (DB::table('notifications')->select('user_id','type',DB::raw('COUNT(*) c'),DB::raw('MIN(created_at) f'),DB::raw('MAX(created_at) l'))->groupBy('user_id','type')->orderBy('user_id')->get() as $r) {
    echo "    user #{$r->user_id} (" . ($userRole[$r->user_id] ?? 'DELETED USER') . ") [{$r->type}] x{$r->c}  {$r->f} -> {$r->l}\n";
}
foreach ($notifs as $n) {
    $text = $n->title . ' ' . $n->message;
    $live = $mentionsLiveFarm($text);
    $row = [ 'notifications', $n->id, $n->user_id, $actor($n->user_id), $n->type, $n->title,
             mb_substr(preg_replace('/\s+/', ' ', $n->message), 0, 250), $n->created_at, $referenced($text) ];
    if (!isset($userRole[$n->user_id])) {
        $add('D', array_merge($row, ['REVIEW', 'Recipient user no longer exists — unexpected (FK should cascade). Inspect before acting.']));
    } elseif ($live !== null) {
        $add('C', array_merge($row, ['NO — KEEP', "References \"$live\", a farm/owner that STILL EXISTS. Current operational data."]));
    } elseif ($referenced($text) !== '') {
        $add('A', array_merge($row, ['YES', 'References a farm/owner not present in the farms table — leftover from removed farm data.']));
    } else {
        $add('D', array_merge($row, ['REVIEW', 'No farm reference could be parsed from the text. Read it manually.']));
    }
}

// ── ACTIVITY LOGS ────────────────────────────────────────────────────────
h('STEP 2d — ACTIVITY LOGS');
$logs = DB::table('activity_logs')->orderBy('id')->get();
echo "  total = " . $logs->count() . "\n\n  By type:\n";
foreach (DB::table('activity_logs')->select('type', DB::raw('COUNT(*) c'))->groupBy('type')->orderByDesc('c')->get() as $r) echo "    {$r->type}: {$r->c}\n";
echo "\n  By actor:\n";
foreach (DB::table('activity_logs')->select('user_id', DB::raw('COUNT(*) c'))->groupBy('user_id')->orderBy('user_id')->get() as $r) {
    echo "    " . ($r->user_id === null ? 'NULL (deleted actor)' : "user #{$r->user_id} (" . ($userRole[$r->user_id] ?? 'DELETED USER') . ')') . ": {$r->c}\n";
}
$farmTypes = ['Farm','Inspection','Service','Request','Vaccination','Blood Test','Farm Biosecurity','Alert'];
foreach ($logs as $l) {
    $d = (string) $l->details;
    $text = $l->action . ' ' . $d;
    $live = $mentionsLiveFarm($text);
    $row = [ 'activity_logs', $l->id, $l->user_id, $actor($l->user_id), $l->type, $l->action,
             mb_substr(preg_replace('/\s+/', ' ', $d), 0, 250), $l->created_at, $referenced($text) ];

    if ($live !== null) {
        $add('C', array_merge($row, ['NO — KEEP', "References \"$live\", which STILL EXISTS. Current operational history."]));
    } elseif ($l->type === 'Account') {
        if (preg_match('/Farm Owner|owner account|Verified Farm Owner/i', $text)) {
            $add('B', array_merge($row, ['NEEDS YOUR DECISION', 'Account-audit entry about a farm owner who is no longer in the users table. Deleting it erases identity/provisioning history.']));
        } else {
            $add('C', array_merge($row, ['NO — KEEP', 'Staff/security audit (admin or vet account change, password reset). Must be preserved.']));
        }
    } elseif (in_array($l->type, $farmTypes, true)) {
        $add('A', array_merge($row, ['YES', "Farm-scoped activity ({$l->type}) whose farm/service request is no longer present."]));
    } else {
        $add('D', array_merge($row, ['REVIEW', "Unrecognised type \"{$l->type}\" with no live farm reference. Read it manually."]));
    }
}
fclose($out);

// ─────────────────────────────────────────────────────────────────────────
// STEP 3 — classification output
// ─────────────────────────────────────────────────────────────────────────
h('STEP 3 — CLASSIFICATION');
echo "  A  clearly old farm-related test data        : {$tally['A']}\n";
echo "  B  account-audit about deleted farm owners   : {$tally['B']}  (your decision)\n";
echo "  C  legitimate / live / staff-security records: {$tally['C']}  (KEEP)\n";
echo "  D  uncertain, needs manual review            : {$tally['D']}\n";

foreach (['A' => 'BUCKET A — candidates', 'B' => 'BUCKET B — needs your decision', 'D' => 'BUCKET D — manual review'] as $k => $label) {
    echo "\n  --- $label ---\n";
    if (!$rowsByBucket[$k]) { echo "    (none)\n"; continue; }
    foreach ($rowsByBucket[$k] as $r) {
        echo "    {$r[0]} #{$r[1]} | user " . ($r[2] ?? 'NULL') . " | {$r[4]} | {$r[5]} :: " . mb_substr($r[6], 0, 90) . " | {$r[7]}\n";
    }
}

echo "\n  ID lists (for building an approved deletion set LATER):\n";
foreach (['A', 'B'] as $k) {
    foreach (['notifications', 'activity_logs'] as $t) {
        $ids = array_map(fn($r) => $r[1], array_filter($rowsByBucket[$k], fn($r) => $r[0] === $t));
        echo "    bucket $k / $t (" . count($ids) . "): " . (count($ids) ? implode(',', $ids) : '-') . "\n";
    }
}

echo "\n  Full per-record CSV written to:\n    $csvPath\n";
echo "\n  NOTHING WAS DELETED OR MODIFIED. This script only reads.\n\n";
