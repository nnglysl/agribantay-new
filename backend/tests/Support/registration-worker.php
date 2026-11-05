<?php

use App\Http\Controllers\Admin\FarmController;
use App\Http\Controllers\Admin\FarmOwnerController;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Tests\Support\PoultryHouseDatabase;

require dirname(__DIR__, 2).'/vendor/autoload.php';
require_once __DIR__.'/PoultryHouseDatabase.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
[$script, $database, $mode, $actorId, $ownerId] = $argv;
PoultryHouseDatabase::server();
config(['database.connections.house_phase2' => PoultryHouseDatabase::fixtureConnection($database), 'cache.default' => 'array']);
DB::setDefaultConnection('house_phase2');
DB::purge('house_phase2');
Http::preventStrayRequests();
Http::fake();
Mail::fake();
$actor = User::findOrFail($actorId);
$payload = ['farms' => [['farm_name' => 'Concurrent farm', 'farm_size' => 'Small', 'house_count' => 2, 'barangay' => 'Calansayan',
    'latitude' => 13.855, 'longitude' => 121.093]]];
if ($mode === 'new') {
    $payload += ['first_name' => 'Concurrent', 'last_name' => 'Owner', 'mobile_number' => '09930000001',
        'email' => 'concurrent-owner@example.test', 'address' => 'Fixture owner address'];
} else {
    $payload['farm_owner_id'] = (int) $ownerId;
}
$request = Request::create('/fixture-registration', 'POST', $payload);
$request->setUserResolver(fn () => $actor);
echo "READY\n";
flush();
try {
    $controller = $mode === 'new' ? FarmOwnerController::class : FarmController::class;
    $app->make($controller)->store($request);
    exit(3); // A simultaneous duplicate must be rejected, not saved twice.
} catch (ValidationException $expected) {
    echo "DONE\n";
} catch (Throwable $error) {
    fwrite(STDERR, get_class($error).' code '.$error->getCode()."\n");
    exit(1);
}
