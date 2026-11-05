<?php

use App\Http\Controllers\SensorIngestController;
use App\Models\Sensor;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use App\Services\PoultryHouseService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\Phase104Database;
use Tests\Support\PoultryHouseDatabase;

require dirname(__DIR__, 2).'/vendor/autoload.php';

try {
    if (getenv('POULTRY_HOUSE_PHASE9_APPLICATION_TEST') !== '1') {
        throw new RuntimeException('Phase 9 worker opt-in required.');
    }
    $input = json_decode(stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR);
    $c = $input['connection'];
    $engine = getenv('PHASE9_APPLICATION_ENGINE');
    if (($c['host'] ?? '') !== '127.0.0.1' || ($c['driver'] ?? '') !== 'mysql'
        || ! preg_match($engine === 'mariadb' ? '/\Aagribantay_house_phase8_[a-f0-9]{12}\z/D' : '/\Aagribantay_house_phase9_[a-f0-9]{12}\z/D', $c['database'] ?? '')
        || (int) $c['port'] !== ($engine === 'mariadb' ? 3307 : 3306)) {
        throw new RuntimeException('Invalid native worker target.');
    }
    $engine === 'mariadb' ? Phase104Database::connect() : PoultryHouseDatabase::server();
    $pdo = new PDO('mysql:host=127.0.0.1;port='.$c['port'].';dbname='.$c['database'], $c['username'], $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    if ($pdo->query('SELECT token_sha256 FROM phase8_fixture_ownership')->fetchColumn() !== hash('sha256', $input['token'])) {
        throw new RuntimeException('Native worker fixture ownership mismatch.');
    }
    foreach (['APP_ENV' => 'testing', 'DB_CONNECTION' => 'mysql', 'DB_HOST' => '127.0.0.1', 'DB_PORT' => $c['port'],
        'DB_DATABASE' => $c['database'], 'DB_USERNAME' => $c['username'], 'DB_PASSWORD' => $c['password'], 'DB_URL' => '', 'DB_SOCKET' => '',
        'CACHE_STORE' => 'array', 'LOG_CHANNEL' => 'null', 'SESSION_DRIVER' => 'array', 'MAIL_MAILER' => 'array', 'QUEUE_CONNECTION' => 'sync'] as $key => $value) {
        putenv($key.'='.$value);
        $_ENV[$key] = $_SERVER[$key] = $value;
    }
    if (is_file(dirname(__DIR__, 2).'/bootstrap/cache/config.php')) {
        throw new RuntimeException('Cached app configuration is forbidden in native workers.');
    }
    $app = require dirname(__DIR__, 2).'/bootstrap/app.php';
    $app->make(Kernel::class)->bootstrap();
    config(['database.connections.house_phase2' => $c, 'cache.default' => 'array', 'logging.default' => 'null',
        'services.unisms.secret_key' => '', 'services.gemini.api_key' => '']);
    DB::setDefaultConnection('house_phase2');
    Http::preventStrayRequests();
    Http::fake();
    Mail::fake();
    $actor = User::findOrFail($input['actor']);
    Auth::setUser($actor);
    DB::connection()->getPdo()->exec('SET SESSION innodb_lock_wait_timeout=8');
    echo 'READY:'.DB::connection()->getPdo()->query('SELECT CONNECTION_ID()')->fetchColumn().PHP_EOL;
    flush();
    fflush(STDOUT);
    $service = app(DeviceAssignmentService::class);
    switch ($input['operation']) {
        case 'assign':
            $service->assignHouse($actor, $input['sensor'], $input['farm'], $input['house'], $input['version']);
            break;
        case 'activate':
            $service->updateStatus($actor, $input['sensor'], 'Active');
            break;
        case 'deactivate_house':
            app(PoultryHouseService::class)->transition($actor, $input['farm'], $input['house'], 'Inactive');
            break;
        case 'ingest':
            $sensor = Sensor::findOrFail($input['sensor']);
            $response = app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST',
                ['device_key' => $sensor->device_key, 'ammonia_raw' => 100, 'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60]));
            echo 'RESULT:'.$response->getStatusCode().PHP_EOL;
            exit(0);
        default:
            throw new RuntimeException('Unsupported application worker operation.');
    }
    echo "RESULT:200\n";
} catch (ValidationException $error) {
    echo "RESULT:422\n";
} catch (HttpExceptionInterface $error) {
    echo 'RESULT:'.$error->getStatusCode().PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, get_class($error).' '.$error->getCode().PHP_EOL);
    exit(1);
}
