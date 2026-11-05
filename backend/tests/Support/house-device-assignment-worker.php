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
use Tests\Support\PoultryHouseDatabase;

require dirname(__DIR__, 2).'/vendor/autoload.php';
require_once __DIR__.'/PoultryHouseDatabase.php';
[$script, $database, $actorId, $operation, $sensorId, $farmId, $houseId, $version] = $argv;
PoultryHouseDatabase::server();
$connection = PoultryHouseDatabase::fixtureConnection($database);
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
config(['database.connections.house_phase2' => $connection, 'cache.default' => 'array', 'logging.default' => 'null',
    'services.unisms.secret_key' => '', 'services.gemini.api_key' => '']);
DB::setDefaultConnection('house_phase2');
DB::purge('house_phase2');
Http::preventStrayRequests();
Mail::fake();
$actor = User::findOrFail((int) $actorId);
Auth::setUser($actor);
echo "READY\n";
flush();
try {
    $service = app(DeviceAssignmentService::class);
    if ($operation === 'assign') {
        $service->assignHouse($actor, (int) $sensorId, (int) $farmId, (int) $houseId, (int) $version);
    } elseif ($operation === 'activate') {
        $service->updateStatus($actor, (int) $sensorId, 'Active');
    } elseif ($operation === 'deactivate_house') {
        app(PoultryHouseService::class)->transition($actor, (int) $farmId, (int) $houseId, 'Inactive');
    } elseif ($operation === 'ingest') {
        $sensor = Sensor::findOrFail((int) $sensorId);
        $response = app(SensorIngestController::class)->store(Request::create('/api/sensor-readings', 'POST',
            ['device_key' => $sensor->device_key, 'ammonia_raw' => 3000, 'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60]));
        echo 'RESULT:'.$response->getStatusCode()."\n";
        exit;
    } else {
        throw new RuntimeException('Unknown fixture operation');
    }
    echo "RESULT:200\n";
} catch (ValidationException $error) {
    echo "RESULT:422\n";
} catch (HttpExceptionInterface $error) {
    echo 'RESULT:'.$error->getStatusCode()."\n";
} catch (Throwable $error) {
    fwrite(STDERR, get_class($error).' code '.$error->getCode()."\n");
    exit(1);
}
