<?php

use App\Models\GeneratedReport;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

require dirname(__DIR__, 2).'/vendor/autoload.php';
[$script, $database, $userId, $barrier] = $argv;
if (! preg_match('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', $database)) {
    exit(2);
}
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! in_array(config('database.connections.mysql.host'), ['127.0.0.1', 'localhost', '::1'], true)) {
    exit(3);
}
config(['database.connections.mysql.database' => $database, 'database.connections.mysql.url' => null, 'database.default' => 'mysql',
    'cache.default' => 'array', 'logging.default' => 'null']);
DB::purge('mysql');
Http::preventStrayRequests();
Mail::fake();
$user = User::findOrFail($userId);
$token = $user->createToken('private-race')->plainTextToken;
// A deterministic wider old check/create window; never used by application code.
GeneratedReport::creating(fn () => usleep(500000));
echo "READY\n";
flush();
$deadline = microtime(true) + 20;
while (! is_file($barrier)) {
    if (microtime(true) > $deadline) {
        exit(4);
    } usleep(10000);
    clearstatcache(true, $barrier);
}
$request = Request::create('/api/'.($user->role === 'vet' ? 'vet' : 'admin').'/generated-reports', 'POST', [], [], [],
    ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$token],
    json_encode(['report_name' => 'Synthetic parallel report', 'period_start' => '1995-01-01', 'period_end' => '1995-01-31', 'report_type' => 'Monthly']));
try {
    $response = $app->make(Illuminate\Contracts\Http\Kernel::class)->handle($request);
    echo 'STATUS='.$response->getStatusCode()."\n";
} catch (Throwable $e) {
    fwrite(STDERR, get_class($e)."\n");
    exit(5);
}
