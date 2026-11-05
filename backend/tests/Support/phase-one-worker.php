<?php

use App\Http\Controllers\SensorIngestController;
use App\Http\Controllers\SuperAdmin\FarmDeletionController;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use App\Services\RecommendationExplanationService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
[$script, $database, $action, $sensorId, $farmId, $utc] = $argv;
$expected = (int) ($argv[6] ?? 200);
$mysql = config('database.connections.mysql');
if (! preg_match('/\Aagribantay_phase1_test_[a-f0-9]{12}\z/', $database)
    || ! in_array($mysql['host'], ['localhost', '127.0.0.1', '::1'], true)) {
    exit(2);
}
config(['database.connections.phase1_mysql' => array_replace($mysql, ['database' => $database, 'url' => null]),
    'cache.default' => 'array', 'services.unisms.secret_key' => 'isolated-test',
    'services.unisms.base_url' => 'https://sms.test/api']);
DB::setDefaultConnection('phase1_mysql');
DB::purge('phase1_mysql');
Carbon::setTestNow($utc);
Http::preventStrayRequests();
Http::fake(['*' => Http::response(['message' => ['status' => 'pending']], 201)]);
Mail::fake();
$explanation = Mockery::mock(RecommendationExplanationService::class);
$explanation->shouldReceive('markForRefresh')->zeroOrMoreTimes();
$app->instance(RecommendationExplanationService::class, $explanation);
Auth::setUser(User::where('role', $action === 'delete' ? 'super_admin' : 'admin')->firstOrFail());
DB::select('SELECT 1');
echo "READY\n";
flush();
try {
    if ($action === 'ingest') {
        $response = app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST', [
            'device_key' => 'phase-one-race-fixture', 'ammonia_raw' => 100, 'soil_raw' => 3000,
            'temperature' => 28, 'humidity' => 60, 'farm_id' => (int) $farmId,
        ]));
        if ($response->getStatusCode() !== $expected) {
            exit(3);
        }
    } elseif ($action === 'assign') {
        app(DeviceAssignmentService::class)->change((int) $sensorId, (int) $farmId);
    } elseif ($action === 'delete') {
        Cache::put('farm-delete-otp:'.Auth::id().':'.$farmId, ['hash' => Hash::make('123456'), 'closure_confirmed' => true], 60);
        $response = app(FarmDeletionController::class)->destroy(Request::create('/fixture-delete', 'DELETE', [
            'code' => '123456', 'permanently_discontinued' => true, 'acknowledge_permanent_loss' => true]), (int) $farmId);
        if ($response->getStatusCode() !== 200) {
            exit(3);
        }
    } else {
        exit(4);
    }
    echo "DONE\n";
} catch (Throwable $exception) {
    if ($action === 'delete' && $exception instanceof HttpExceptionInterface
        && $exception->getStatusCode() === $expected) {
        echo "DONE\n";
        exit(0);
    }
    if ($action === 'assign' && $expected === 404
        && $exception instanceof ModelNotFoundException) {
        echo "DONE\n";
        exit(0);
    }
    fwrite(STDERR, get_class($exception).' code '.$exception->getCode()."\n");
    if ($exception instanceof TypeError) {
        fwrite(STDERR, $exception->getMessage()."\n");
    }
    exit(1);
}
