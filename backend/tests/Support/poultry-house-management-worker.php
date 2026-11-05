<?php

use App\Models\User;
use App\Services\PoultryHouseService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\Support\PoultryHouseDatabase;

require dirname(__DIR__, 2).'/vendor/autoload.php';
require_once __DIR__.'/PoultryHouseDatabase.php';
[$script, $database, $actorId, $farmId, $requestId] = $argv;
PoultryHouseDatabase::server();
$connection = PoultryHouseDatabase::fixtureConnection($database);
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
config(['database.connections.house_phase2' => $connection, 'cache.default' => 'array', 'logging.default' => 'null']);
DB::setDefaultConnection('house_phase2');
DB::purge('house_phase2');
Http::preventStrayRequests();
Mail::fake();
$actor = User::findOrFail((int) $actorId);
echo "READY\n";
flush();
try {
    $result = app(PoultryHouseService::class)->add($actor, (int) $farmId, $requestId);
    echo 'RESULT:'.json_encode($result, JSON_THROW_ON_ERROR)."\n";
} catch (Throwable $error) {
    fwrite(STDERR, get_class($error).' code '.$error->getCode()."\n");
    exit(1);
}
