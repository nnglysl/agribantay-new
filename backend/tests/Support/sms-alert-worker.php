<?php

use App\Models\Farm;
use App\Services\FarmStatusService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

// CLI-only test helper. Every HTTP request is faked; no real SMS is sent.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[$script, $database, $farmId, $barrier, $utc] = $argv;
if (! preg_match('/\Aagribantay_sms_test_[a-f0-9]{12}\z/', $database)) {
    exit(2);
}
config([
    'database.connections.sms_concurrency' => array_replace(config('database.connections.mysql'), ['database' => $database, 'url' => null]),
    'services.unisms.secret_key' => 'fake-test-key',
    'services.unisms.base_url' => 'https://sms.test/api',
    'sensors.alerting_metrics' => ['ammonia', 'moisture'],
    'sensors.offline_after_minutes' => 3,
]);
DB::setDefaultConnection('sms_concurrency');
Carbon::setTestNow($utc);
Http::preventStrayRequests();
Http::fake(function () use ($farmId) {
    DB::table('sms_test_deliveries')->insert(['farm_id' => $farmId]);
    // Keep the mocked provider request in flight while other workers run.
    usleep(300000);

    return Http::response(['message' => ['status' => 'pending', 'reference_id' => 'fake-concurrent-send']], 201);
});
echo "READY\n";
flush();
$deadline = microtime(true) + 15;
while (! is_file($barrier)) {
    if (microtime(true) > $deadline) {
        exit(3);
    }
    usleep(10000);
    clearstatcache(true, $barrier);
}
try {
    $farm = Farm::findOrFail($farmId);
    app(FarmStatusService::class)->syncSmsAlerts($farm);
    echo "DONE\n";
} catch (Throwable $exception) {
    fwrite(STDERR, get_class($exception).' code '.$exception->getCode()."\n");
    exit(1);
}
