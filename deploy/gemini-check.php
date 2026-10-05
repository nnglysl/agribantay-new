<?php
/*
|-----------------------------------------------------------------------------
| AgriBantay — Gemini configuration check
|-----------------------------------------------------------------------------
|
| Says why the Filipino translation and explanation are missing, instead of
| leaving it to guesswork. Reads configuration, makes ONE live call, and
| prints the last Gemini lines from the log.
|
| SAFETY
| - READ-ONLY. Writes nothing to the database and changes no configuration.
| - NEVER prints the API key. Only its length and first four characters, which
|   is enough to tell an AI Studio key (AIza...) from something else without
|   putting the secret on screen.
| - The live call is a single tiny prompt, so it cannot meaningfully eat into
|   a free-tier quota.
|
| USAGE
|   /gemini-check.php?token=TOKEN
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

use Illuminate\Support\Facades\Http;

$key   = (string) config('services.gemini.api_key');
$model = (string) config('services.gemini.model');

echo "AgriBantay — Gemini check\n";
echo str_repeat('=', 66), "\n\n";

echo "Configuration\n";
echo str_repeat('-', 66), "\n";
printf("  key present : %s\n", $key !== '' ? 'YES' : 'NO');
printf("  key length  : %d\n", strlen($key));
printf("  key prefix  : %s...\n", substr($key, 0, 4));
printf("  model       : %s\n\n", $model !== '' ? $model : '(empty)');

if ($key === '') {
    exit("GEMINI_API_KEY is empty in .env — that alone explains the missing text.\n");
}

// Which models this key can actually reach. A 404 on generateContent almost
// always means the configured model name is not one of these.
echo "Models available to this key\n";
echo str_repeat('-', 66), "\n";

try {
    $list = Http::timeout(15)
        ->withHeaders(['x-goog-api-key' => $key])
        ->get('https://generativelanguage.googleapis.com/v1beta/models');

    if (!$list->successful()) {
        printf("  request failed — HTTP %d\n", $list->status());
        echo '  ', trim(substr($list->body(), 0, 600)), "\n\n";
    } else {
        $names = [];
        foreach (($list->json('models') ?? []) as $m) {
            if (in_array('generateContent', $m['supportedGenerationMethods'] ?? [], true)) {
                $names[] = str_replace('models/', '', $m['name']);
            }
        }
        sort($names);
        foreach ($names as $n) {
            printf("  %s%s\n", $n, $n === $model ? '   <-- configured' : '');
        }
        if (!in_array($model, $names, true)) {
            echo "\n  The configured model is NOT in this list. Set GEMINI_MODEL in .env\n";
            echo "  to one of the names above, then run run-migrate.php to clear config.\n";
        }
        echo "\n";
    }
} catch (\Throwable $e) {
    echo '  exception: ', $e->getMessage(), "\n\n";
}

// One real call against the configured model — the same request shape the
// application makes, so a pass here means the application will work too.
echo "Live call to the configured model\n";
echo str_repeat('-', 66), "\n";

try {
    $response = Http::timeout(20)
        ->withHeaders(['x-goog-api-key' => $key, 'Content-Type' => 'application/json'])
        ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent", [
            'contents' => [['parts' => [['text' => 'Reply with the single word: OK']]]],
        ]);

    printf("  HTTP %d\n", $response->status());

    if ($response->successful()) {
        printf("  reply: %s\n", trim((string) $response->json('candidates.0.content.parts.0.text')));
        echo "\n  Gemini is reachable and the model name is valid.\n";
    } else {
        echo '  ', trim(substr($response->body(), 0, 800)), "\n";
        echo "\n  ", match ($response->status()) {
            400 => "400 usually means the key is not a Generative Language API key.\n",
            403 => "403 means the key is rejected — wrong key type, or the\n  Generative Language API is not enabled on that Google project.\n",
            404 => "404 means the model name is wrong — pick one from the list above.\n",
            429 => "429 means the free-tier quota for today is used up. It resets daily.\n",
            default => "See the body above for the reason.\n",
        };
    }
} catch (\Throwable $e) {
    echo '  exception: ', $e->getMessage(), "\n";
}

// Whatever the application itself recorded the last time it tried.
echo "\nRecent Gemini lines from laravel.log\n";
echo str_repeat('-', 66), "\n";

$logPath = $basePath . '/storage/logs/laravel.log';

if (!is_file($logPath)) {
    echo "  no log file at storage/logs/laravel.log\n";
} else {
    $found = [];
    // Read from the end: the log can be large and only the tail matters.
    $handle = fopen($logPath, 'r');
    $size   = filesize($logPath);
    $chunk  = 400_000;
    fseek($handle, max(0, $size - $chunk));
    $tail = fread($handle, $chunk);
    fclose($handle);

    foreach (explode("\n", $tail) as $line) {
        if (stripos($line, 'gemini') !== false) {
            $found[] = substr($line, 0, 400);
        }
    }

    $found = array_slice($found, -10);
    if (!$found) {
        echo "  none — the application has not logged a Gemini failure recently.\n";
    } else {
        foreach ($found as $line) {
            echo '  ', $line, "\n";
        }
    }
}

echo "\nDELETE this file from public_html now.\n";
