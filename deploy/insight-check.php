<?php
/*
|-----------------------------------------------------------------------------
| AgriBantay — farmer insight check
|-----------------------------------------------------------------------------
|
| Says why the Filipino text is or is not appearing, by showing the cached
| row the explanation service is serving and the tips it is being paired
| against. READ-ONLY apart from an optional forced refresh.
|
| USAGE
|   Inspect :  /insight-check.php?token=TOKEN
|   Refresh :  /insight-check.php?token=TOKEN&refresh=1
|              marks every farm for regeneration on the next dashboard load
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

echo "AgriBantay — farmer insight check\n";
echo str_repeat('=', 66), "\n\n";

$rows = DB::table('ai_recommendations')->get();

if ($rows->isEmpty()) {
    echo "ai_recommendations is EMPTY.\n";
    echo "Nothing has been generated yet — every request is still calling Gemini\n";
    echo "and failing, or no farmer dashboard has been opened since the fix.\n\n";
}

foreach ($rows as $row) {
    $farm = DB::table('farms')->where('id', $row->farm_id)->first();
    printf("Farm %d — %s\n", $row->farm_id, $farm->farm_name ?? '(unknown)');
    echo str_repeat('-', 66), "\n";
    printf("  generated_date : %s%s\n", $row->generated_date ?? '(null)',
        ($row->generated_date ?? '') === now()->toDateString() ? '   <-- today, treated as fresh' : '');
    printf("  force_refresh  : %s\n", $row->force_refresh ? 'YES' : 'no');
    printf("  explanation_en : %s\n", $row->explanation_en ? 'present' : 'NULL');
    printf("  explanation_fil: %s\n", $row->explanation_fil ? 'present' : 'NULL');
    printf("  main_action_fil: %s\n", $row->main_action_fil ? 'present' : 'NULL');

    $tipsFil = $row->tips_fil;
    $decoded = is_string($tipsFil) ? json_decode($tipsFil, true) : $tipsFil;

    if (!$decoded) {
        echo "  tips_fil       : NULL  <-- this is why the Tagalog is missing\n";
    } else {
        printf("  tips_fil       : %d item(s)\n", count($decoded));
        foreach ($decoded as $i => $t) {
            printf("      %d. %s\n", $i + 1, mb_substr((string) $t, 0, 90));
        }
        echo "\n  NOTE: the screen only shows these when their COUNT matches the\n";
        echo "  English tips computed for the current reading.\n";
    }
    echo "\n";
}

if (($_GET['refresh'] ?? '') === '1') {
    $n = DB::table('ai_recommendations')->update(['force_refresh' => true]);
    echo "Marked {$n} row(s) for regeneration.\n";
    echo "Open the farmer dashboard, wait a minute, then re-run this check.\n\n";
} else {
    echo "Add &refresh=1 to force regeneration on the next dashboard load.\n\n";
}

echo "DELETE this file from public_html now.\n";
