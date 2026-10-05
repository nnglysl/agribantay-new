<?php
/*
|-----------------------------------------------------------------------------
| AgriBantay — cache refresh + deactivation-fix verifier
|-----------------------------------------------------------------------------
|
| WHY THIS EXISTS
| The deactivated-account fix adds a route middleware ('active') and registers
| its alias in bootstrap/app.php. Both are read through Laravel's compiled
| config and route caches. If those caches are stale on the server, the new
| middleware silently does not run: deactivated owners keep their access and
| the deploy looks like it failed, even though every file uploaded correctly.
|
| The Add Account fix needs one schema change too: users.mobile_number must
| be nullable again, because Admin and Vet accounts may be created with an
| email only. While it is NOT NULL, every such account fails with SQLSTATE
| 1048 and the screen shows "Server Error".
|
| The checks below exist because "cleared OK" and "migrated" do not prove the
| fixes are live — only that nothing errored.
|
| It runs `migrate` WITHOUT --seed and without fresh/refresh/reset, so it can
| only relax that one column. It can never drop a table or wipe rows.
|
| WHERE IT GOES
|   public_html/refresh-caches.php
|
| HOW TO USE
|   1. Set SECRET_TOKEN below to your own random string. It will NOT run
|      until you do.
|   2. Upload AFTER all the changed PHP files are in place — clearing the
|      cache before the new code lands just rebuilds the old behaviour.
|   3. Visit:  https://agribantay.com/refresh-caches.php?token=YOUR_TOKEN
|   4. Every line under "Verification" must say OK.
|   5. DELETE THIS FILE from public_html immediately afterwards.
|
| This file is a deployment tool. It is NOT part of the application and must
| not be left on the server.
*/

// ----------------------------------------------------------------- 1. TOKEN
// Replace this with your own random string before uploading.
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
// Same layout assumption as run-migrate.php: the app lives one level up from
// public_html. If your layout differs, fix this one line.
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

echo "AgriBantay — cache refresh\n";
echo str_repeat('=', 60), "\n\n";
echo "Laravel base path : ", realpath($basePath) ?: $basePath, "\n\n";

// ------------------------------------------------- 3. PRE-FLIGHT: FILES THERE?
// A cleared cache cannot make up for a file that was never uploaded, and the
// failure then looks identical to a caching problem. Checked first so a
// missing upload is named as such.
$requiredFiles = [
    'app/Http/Middleware/EnsureActiveAccount.php',
    'app/Http/Controllers/AuthController.php',
    'app/Http/Controllers/Admin/FarmController.php',
    'app/Http/Controllers/SuperAdmin/AccountController.php',
    'routes/api.php',
    'bootstrap/app.php',
    'app/Services/SmsService.php',
    'app/Support/DisposalMethods.php',
    'app/Http/Controllers/SuperAdmin/FarmDeletionController.php',
    'app/Http/Controllers/Admin/AlertHistoryController.php',
    'app/Http/Controllers/Admin/ActivityLogController.php',
    'app/Http/Controllers/NotificationController.php',
    'app/Http/Controllers/Admin/InspectionController.php',
    'app/Models/Inspection.php',
    'app/Http/Controllers/Vet/FarmController.php',
    'app/Http/Controllers/Admin/GeneratedReportController.php',
    'app/Services/GeneratedReportService.php',
    'app/Http/Controllers/Admin/ReportController.php',
    'app/Http/Controllers/Vet/GeneratedReportController.php',
    'app/Console/Commands/PruneOrphanFarmOwners.php',
    'routes/console.php',
    'database/migrations/2026_10_01_120000_add_cancellation_reason_to_inspections_table.php',
    'app/Http/Controllers/Farmer/DisposalController.php',
    'database/migrations/2026_10_01_090000_make_user_mobile_number_nullable_again.php',
];

$missing = false;

foreach ($requiredFiles as $relative) {
    $present = is_file($basePath . '/' . $relative);
    $missing = $missing || ! $present;
    printf("  %-58s %s\n", $relative, $present ? 'found' : 'MISSING  <-- upload it');
}

echo "\n";

if ($missing) {
    echo str_repeat('=', 60), "\n";
    echo "STOPPING. Upload the missing file(s) above, then run this again.\n";
    exit;
}

// ------------------------------------------------------- 4. CLEAR THE CACHES
// config:clear so the alias map in bootstrap/app.php is re-read, route:clear
// so the 'active' middleware is attached to the authenticated group, and
// cache:clear to drop anything the app memoised under the old behaviour.
// Order matters: clear first so migrate reads the live .env rather than a
// stale cached copy, then clear again at the end so the new routes and the
// middleware alias are picked up.
$commands = [
    ['config:clear', []],
    ['route:clear',  []],
    ['cache:clear',  []],
    ['view:clear',   []],
    ['migrate',      ['--force' => true]],
    ['config:clear', []],
    ['route:clear',  []],
];

foreach ($commands as [$command, $options]) {
    echo ">>> php artisan {$command}\n";

    try {
        $exitCode = Illuminate\Support\Facades\Artisan::call($command, $options);
        $output   = trim(Illuminate\Support\Facades\Artisan::output());

        if ($output !== '') {
            echo $output, "\n";
        }

        echo $exitCode === 0 ? "--- OK\n\n" : "--- FAILED (exit {$exitCode})\n\n";
    } catch (Throwable $e) {
        echo '--- ERROR: ', $e->getMessage(), "\n\n";
    }
}

// ------------------------------------------------------------- 5. VERIFY
// Proves the thing this deploy was actually for. "Caches cleared" only means
// no command errored; these read back the state the fix depends on.
echo str_repeat('=', 60), "\n";
echo "Verification\n\n";

$failures = [];

$check = function (string $label, bool $passed, string $hint) use (&$failures) {
    printf("  %-46s %s\n", $label, $passed ? 'OK' : 'FAILED');

    if (! $passed) {
        $failures[] = "{$label} — {$hint}";
    }
};

// 5a. The middleware class is autoloadable. Catches an upload that landed in
// the wrong folder, or a stale composer classmap on the server.
$check(
    'EnsureActiveAccount class loads',
    class_exists(\App\Http\Middleware\EnsureActiveAccount::class),
    'file is present but not autoloading — run composer dump-autoload on the server'
);

// 5b. The alias is registered. Without it the route group silently resolves
// 'active' to nothing rather than erroring.
try {
    $router  = $app->make(Illuminate\Routing\Router::class);
    $aliases = $router->getMiddleware();

    $check(
        "'active' alias registered",
        ($aliases['active'] ?? null) === \App\Http\Middleware\EnsureActiveAccount::class,
        'bootstrap/app.php did not upload, or the cache was rebuilt before it did'
    );
} catch (Throwable $e) {
    $check("'active' alias registered", false, 'could not read the router: ' . $e->getMessage());
}

// 5c. The middleware is actually attached to an authenticated route. This is
// the check that would have caught a stale route cache, which is the specific
// failure this whole file exists to prevent.
try {
    $routes  = $app->make(Illuminate\Routing\Router::class)->getRoutes();
    $meRoute = null;

    foreach ($routes as $route) {
        if ($route->uri() === 'api/me') {
            $meRoute = $route;
            break;
        }
    }

    if ($meRoute === null) {
        $check('api/me carries the active middleware', false, 'route not found — routes/api.php may not have uploaded');
    } else {
        $stack = $meRoute->gatherMiddleware();

        $check(
            'api/me carries the active middleware',
            in_array('active', $stack, true)
                || in_array(\App\Http\Middleware\EnsureActiveAccount::class, $stack, true),
            'the route cache is stale — re-run this file, or delete bootstrap/cache/routes-*.php by hand'
        );
    }
} catch (Throwable $e) {
    $check('api/me carries the active middleware', false, 'could not inspect routes: ' . $e->getMessage());
}

// 5d. The login endpoint carries the new wording. Confirms AuthController is
// the updated copy and not an older file left behind by a partial upload.
$authSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/AuthController.php');

$check(
    'login returns the deactivated message',
    str_contains($authSource, 'Your account has been deactivated'),
    'AuthController.php on the server is an older copy — re-upload it'
);

// 5f. The column the Add Account fix depends on. Read from the live schema
// rather than from the migrations table: a migration recorded as run while
// the column stayed NOT NULL would still leave Add Account broken.
try {
    $column = Illuminate\Support\Facades\DB::selectOne(
        'SELECT IS_NULLABLE n FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
        ['users', 'mobile_number']
    );

    $check(
        'users.mobile_number is nullable',
        $column !== null && strtoupper((string) $column->n) === 'YES',
        'the migration did not apply — Add Account will still fail for email-only accounts'
    );
} catch (Throwable $e) {
    $check('users.mobile_number is nullable', false, 'could not read the schema: ' . $e->getMessage());
}

// 5g. The account-creation path keeps both channels. Confirms the server has
// the updated controller and not the copy that discarded the mobile number.
$accountSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/SuperAdmin/AccountController.php');

$check(
    'Add Account keeps both email and mobile',
    str_contains($accountSource, "'contact_number'") && str_contains($accountSource, 'ValidationException::withMessages'),
    'AccountController.php on the server is an older copy — re-upload it'
);

// 5h. The reset endpoint must no longer hand the temporary password back to
// the browser. Checked as an absence, because this one is a credential leak:
// an older copy of the file on the server would quietly keep returning it.
$check(
    'Reset Password does not return the password',
    !str_contains($accountSource, "'temp_password' => \$newPassword")
        && str_contains($accountSource, 'has been sent to the user'),
    'AccountController.php on the server still returns the temporary password — re-upload it'
);

// 5i. The redaction hook the reset path uses to keep the live password out of
// sms_logs. Without it the send still works, so nothing would look wrong.
$smsSource = (string) @file_get_contents($basePath . '/app/Services/SmsService.php');

$check(
    'SmsService supports redacted logging',
    str_contains($smsSource, '$logMessage'),
    'SmsService.php on the server is an older copy — re-upload it'
);

// 5j. The Farm Profile tabs. Both are additive fields, so an older copy of
// the controller still answers 200 with the tab looking merely empty —
// which is why these are checked rather than eyeballed.
$farmSourceNow = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/FarmController.php');

$check(
    'Inspections tab sends Scheduled By',
    str_contains($farmSourceNow, 'scheduled_by_name'),
    'FarmController.php on the server is an older copy — re-upload it'
);

$check(
    'Disposal filter list is served by the API',
    class_exists(\App\Support\DisposalMethods::class)
        && str_contains($farmSourceNow, 'disposal_methods'),
    'DisposalMethods.php or FarmController.php did not upload'
);

// 5k. The Edit Farm save. farms.owner_name is a denormalized copy of the
// owner's name that update() never refreshed, so a rename reported
// success and the profile kept showing the old name. An older copy of
// the file still answers 200, so this is checked rather than trusted.
$check(
    'Edit Farm refreshes the owner name copy',
    str_contains($farmSourceNow, "'owner_name' => \$ownerName"),
    'FarmController.php on the server is an older copy — re-upload it'
);

// 5l. The Farm Owner lifecycle. Two halves that must land together: the
// old "no active farms -> deactivate the owner" cascade must be GONE, and
// the delete path must decide by remaining farm count. Shipping only one
// of the two leaves owners either wrongly locked out or wrongly kept.
$deletionSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/SuperAdmin/FarmDeletionController.php');

$check(
    'Farm deactivation no longer locks the owner',
    !str_contains($farmSourceNow, "'status' => 'inactive'"),
    'FarmController.php still carries the old cascade — re-upload it'
);

$check(
    'Deletion decides by remaining farm count',
    str_contains($deletionSource, '$remaining === 0')
        && str_contains($deletionSource, 'owner_deleted'),
    'FarmDeletionController.php on the server is an older copy — re-upload it'
);

// 5m. Recent Alerts sorting. The frontend now orders on this ISO instant
// instead of reversing the list; without it the sort key is undefined and
// every row compares equal, so the list silently keeps arrival order.
$alertSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/AlertHistoryController.php');

$check(
    'Alerts expose a sortable raw timestamp',
    str_contains($alertSource, 'triggered_at_raw'),
    'AlertHistoryController.php on the server is an older copy — re-upload it'
);

// 5n. Activity Logs timestamps. The column headed "Time" used to show
// diffForHumans() ("3 days ago"), which never named the day or the hour.
$logSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/ActivityLogController.php');

$check(
    'Activity Logs send a real date and time',
    str_contains($logSource, 'LocalTime::dateTime($log->created_at)'),
    'ActivityLogController.php on the server is an older copy — re-upload it'
);

// 5o. Alert History barangay filter and the notification bell's "See More".
// Both are additive: an older copy answers 200 and simply ignores the new
// parameter, so the filter would quietly return every barangay and the
// panel would keep offering a button that changes nothing.
$notifSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/NotificationController.php');

$check(
    'Alert History accepts a barangay filter',
    str_contains($alertSource, '$request->barangay'),
    'AlertHistoryController.php on the server is an older copy — re-upload it'
);

$check(
    'Notifications support See More paging',
    str_contains($notifSource, 'has_more'),
    'NotificationController.php on the server is an older copy — re-upload it'
);

// 5p. Inspection cancellation. Two halves: the column must exist, and the
// endpoint must require a reason and notify the farm owner. An older
// controller silently cancels with no reason and tells nobody.
$inspectionSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/InspectionController.php');

try {
    $hasColumn = Illuminate\Support\Facades\Schema::hasColumn('inspections', 'cancellation_reason');
} catch (Throwable $e) {
    $hasColumn = false;
}

$check(
    'inspections.cancellation_reason exists',
    $hasColumn,
    'the migration did not apply — cancelling will fail to save the reason'
);

$check(
    'Cancelling requires a reason and notifies',
    str_contains($inspectionSource, 'A cancellation reason is required.')
        && str_contains($inspectionSource, "'Inspection Cancelled'"),
    'InspectionController.php on the server is an older copy — re-upload it'
);

// 5q. Vet Current Conditions. Additive again: an older controller answers
// 200 without latest_reading, and the section simply renders its empty
// state as though the farm had never reported.
$vetSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Vet/FarmController.php');

$check(
    'Vet profile sends current conditions',
    str_contains($vetSource, 'latest_reading')
        && str_contains($vetSource, 'alerting_metrics'),
    'Vet/FarmController.php on the server is an older copy — re-upload it'
);

// 5r. On-demand reporting. The Generate control is useless if the endpoint
// still rejects a report_type it does not know, and the scheduler must be
// gone or the module is no longer purely on demand.
$reportSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/GeneratedReportController.php');
$consoleSource = (string) @file_get_contents($basePath . '/routes/console.php');

$check(
    'Reports accept Daily/Weekly/Monthly/Custom',
    str_contains($reportSource, 'in:Daily,Weekly,Monthly,Custom'),
    'GeneratedReportController.php on the server is an older copy — re-upload it'
);

$check(
    'No scheduled report generation remains',
    !str_contains($consoleSource, 'Schedule::command(GenerateMonthlyReport'),
    'routes/console.php still schedules the monthly archive — re-upload it'
);

// 5s. Report ownership and period scoping. Both are additive, so an older
// copy answers 200 while still showing every user every report, and still
// ignoring the date range on the stat cards.
$genReportSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/GeneratedReportController.php');
$liveReportSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/ReportController.php');

$check(
    'Reports are scoped to who generated them',
    str_contains($genReportSource, "where('generated_by_id', Auth::id())"),
    'GeneratedReportController.php on the server is an older copy — re-upload it'
);

$check(
    'Report stat cards honour the date range',
    str_contains($liveReportSource, '$request->filled(\'from\')'),
    'ReportController.php on the server is an older copy — re-upload it'
);

// 5t. The Vet generate route. Purely additive: without it the Vet page
// shows a Generate button whose request 404s, which looks like the button
// is broken rather than missing from the server.
$vetReportSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Vet/GeneratedReportController.php');

$check(
    'Vet can generate its own reports',
    str_contains($vetReportSource, 'public function store'),
    'Vet/GeneratedReportController.php on the server is an older copy — re-upload it'
);

// 5u. The duplicate guard has to be scoped to the generator, or it reaches
// across modules: the Vet, with an empty archive list, was refused because a
// staff member had already generated that month.
$genReportSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/GeneratedReportController.php');

$check(
    'Duplicate check is per user, not system-wide',
    // Matched on the comment rather than the query, because the query spans
    // lines and the server's copy may carry CRLF endings.
    str_contains($genReportSource, '"already exists" has to mean "exists in yours"'),
    'Admin/GeneratedReportController.php on the server is an older copy — re-upload it'
);

// 5v. The Alerts tab cards count incidents, not raw readings. The old cards
// read "Temperature Anomalies 14,272" beside "Total Alerts 87".
$check(
    'Alert cards count incidents per metric',
    str_contains($liveReportSource, "'ammonia_incidents'") && str_contains($liveReportSource, "'moisture_incidents'"),
    'ReportController.php on the server is an older copy — re-upload it'
);

// 5w. The shortened mobile-number message. Three controllers carry it, and
// missing one leaves the long wording alive on whichever form that controller
// serves — so this checks that the old string is gone from ALL of them rather
// than that the new one is present in any.
$phoneSources = [
    'app/Http/Controllers/Admin/FarmOwnerController.php',
    'app/Http/Controllers/SettingsController.php',
    'app/Http/Controllers/SuperAdmin/AccountController.php',
];

$staleMessage = null;

foreach ($phoneSources as $relative) {
    $source = (string) @file_get_contents($basePath . '/' . $relative);
    if (str_contains($source, 'valid Philippine mobile number')) {
        $staleMessage = $relative;
        break;
    }
}

$check(
    'Mobile number message is the short wording',
    $staleMessage === null,
    $staleMessage === null ? '' : $staleMessage . ' on the server is an older copy — re-upload it'
);

// 5x. The barangay-boundary notice. 28 of 33 barangays have no mapped
// boundary, so this is what most registrations show — it has to read as a
// note, not a fault.
//
// Checked on the 'reason' key rather than on the message text. The wording
// was reworded once already and this check failed on a CORRECT upload,
// reporting a server problem that did not exist. The reason code is the part
// the frontend actually depends on to pick a grey note over a yellow warning.
$locationSource = (string) @file_get_contents($basePath . '/app/Services/FarmLocationService.php');

$check(
    'Barangay notice leads with what passed',
    str_contains($locationSource, 'no_boundary_data'),
    'FarmLocationService.php on the server is an older copy — re-upload it'
);

// 5y. The Critical Alerts panel counted and reddened all four metrics, so a
// farm breaching ammonia and moisture reported "3 Critical" once humidity was
// also outside its band.
$dashboardSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/DashboardController.php');

$check(
    'Critical Alerts counts alerting metrics only',
    str_contains($dashboardSource, "config('sensors.alerting_metrics'"),
    'Admin/DashboardController.php on the server is an older copy — re-upload it'
);

$check(
    'Reading severity is reusable by the dashboard',
    str_contains(
        (string) @file_get_contents($basePath . '/app/Services/FarmStatusService.php'),
        'public function computeStatus'
    ),
    'FarmStatusService.php on the server is an older copy — re-upload it'
);

// 5z. The Vet farm profile shows First/Last name separately, which needs the
// stored columns — owner_name alone cannot be split reliably.
$vetFarmSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Vet/FarmController.php');

$check(
    'Vet profile sends the owner name in two parts',
    str_contains($vetFarmSource, "'owner_first_name'"),
    'Vet/FarmController.php on the server is an older copy — re-upload it'
);

// 5aa. Alert incidents print as one row per FARM, not one per incident.
$genServiceSource = (string) @file_get_contents($basePath . '/app/Services/GeneratedReportService.php');

$check(
    'Reports summarise alerts by farm',
    str_contains($genServiceSource, 'alert_farm_summary'),
    'GeneratedReportService.php on the server is an older copy — re-upload it'
);

// 5ab. Biosecurity: one staff member, one farm per day — enforced on both
// scheduling and rescheduling.
$inspectionSource = (string) @file_get_contents($basePath . '/app/Http/Controllers/Admin/InspectionController.php');

$check(
    'One farm per staff member per day',
    substr_count($inspectionSource, 'one staff member may visit only one farm per day') === 2,
    'Admin/InspectionController.php on the server is an older copy — re-upload it'
);

// 5ac. A report the Head generates himself carries one signature, not his
// name on both the Prepared by and Noted by lines.
$check(
    'Head-generated reports carry one signature',
    str_contains($genServiceSource, "->role === 'super_admin'"),
    'GeneratedReportService.php on the server is an older copy — re-upload it'
);

// 5ad. The sensor summary counts ammonia and moisture only. It used to omit
// moisture and include temperature, which put ~98% of all readings outside
// "safe range" on an official document.
$check(
    'Sensor summary counts alerting metrics only',
    str_contains($genServiceSource, "'moisture_breaches'"),
    'GeneratedReportService.php on the server is an older copy — re-upload it'
);

// 5ae. The scheduler is notified that THEY scheduled it. assigned_to is set
// to the scheduler, so "you have been assigned" described a hand-off the
// system does not have.
$check(
    'Inspection notice says scheduled, not assigned',
    str_contains($inspectionSource, 'You scheduled an inspection for'),
    'Admin/InspectionController.php on the server is an older copy — re-upload it'
);

// ------------------------------------------------------------- 6. RESULT
echo "\n", str_repeat('=', 60), "\n";

if ($failures === []) {
    echo "ALL CHECKS PASSED.\n\n";
    echo "Every check above passed. The parts a check CANNOT prove are\n";
    echo "below - they need a browser:\n";
    echo "\n";
    echo "  1. Inspections: as ONE staff member, schedule two farms on the\n";
    echo "     same day. The second must be refused (biosecurity).\n";
    echo "  2. Dashboard -> Critical Alerts: only ammonia and moisture may be\n";
    echo "     red, and the count must match them.\n";
    echo "  3. Vet -> Farms -> Monitoring: advisory rows read \"Above normal\"\n";
    echo "     with the normal band beside the label.\n";
    echo "  4. Vet -> Farm Information: First Name and Last Name, split.\n";
    echo "  5. Register Farm Owner: a short mobile number shows one red line\n";
    echo "     BELOW the field, not overlapping it.\n";
    echo "  6. Reports -> Files: generate a new report. Alert incidents must\n";
    echo "     be one row per FARM, not one per incident.\n";
    echo "\n";
    echo "  Anything above that still looks old is the frontend build, not\n";
    echo "  this script: re-upload frontend/dist and hard-refresh.\n";
    echo "\n";
    echo "NOW DELETE THIS FILE from public_html.\n";
} else {
    echo count($failures), " CHECK(S) FAILED — the fix is NOT fully live:\n\n";

    foreach ($failures as $failure) {
        echo "  - ", $failure, "\n";
    }

    echo "\nFix the above and run this file again before demoing.\n";
}

echo "\n";
