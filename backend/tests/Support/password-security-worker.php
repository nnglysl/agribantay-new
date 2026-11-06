<?php

// Only a verified private server and a randomly named disposable schema may
// be used. Refuse before Laravel can load operational database credentials.
require dirname(__DIR__, 2).'/vendor/autoload.php';

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\Support\Phase104Database;

if (getenv('PASSWORD_SECURITY_MYSQL') !== '1') throw new RuntimeException('Private security fixture required.');
$schema = getenv('DB_DATABASE');
Phase104Database::connect($schema);
$settings = Phase104Database::settings();
foreach (['DB_CONNECTION' => 'mysql', 'DB_HOST' => '127.0.0.1', 'DB_PORT' => '3307',
    'DB_USERNAME' => $settings['username'], 'DB_PASSWORD' => $settings['password'], 'DB_URL' => '',
    'APP_ENV' => 'testing', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'LOG_CHANNEL' => 'null'] as $key => $value) {
    putenv($key.'='.$value);
    $_ENV[$key] = $_SERVER[$key] = $value;
}
if (is_file(dirname(__DIR__, 2).'/bootstrap/cache/config.php')
    || (getenv('APP_CONFIG_CACHE') && is_file(getenv('APP_CONFIG_CACHE')))) throw new RuntimeException('Cached configuration refused.');
$options = json_decode($argv[1], true, 512, JSON_THROW_ON_ERROR);
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();
if (DB::connection()->getDriverName() !== 'mysql' || DB::connection()->getDatabaseName() !== $schema
    || DB::connection()->getConfig('host') !== '127.0.0.1' || (int) DB::connection()->getConfig('port') !== 3307) {
    throw new RuntimeException('Laravel is not using the verified private fixture.');
}
Mail::fake();
Http::preventStrayRequests();
Http::fake(['*' => Http::response(['message' => ['status' => 'pending']], 200)]);
$paused = false;
DB::listen(function ($query) use ($options, &$paused) {
    if (! $paused && $options['pause'] && str_contains(strtolower($query->sql), 'for update') && str_contains($query->sql, '`users`')) {
        $paused = true;
        fwrite(STDOUT, "LOCKED\n");
        fflush(STDOUT);
        if (trim((string) fgets(STDIN)) !== 'continue') throw new RuntimeException('Missing private worker release.');
    }
});
$url = match ($options['action']) {
    'login' => '/api/login',
    'change-password' => '/api/change-password',
    'reset-password' => '/api/superadmin/accounts/'.(int) $options['payload']['id'].'/reset-password',
    default => throw new RuntimeException('Unknown private security operation.'),
};
$request = Request::create($url, 'POST', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], json_encode($options['payload'], JSON_THROW_ON_ERROR));
if ($options['token']) $request->headers->set('Authorization', 'Bearer '.$options['token']);
fwrite(STDOUT, "READY\n");
fflush(STDOUT);
$response = $kernel->handle($request);
fwrite(STDOUT, 'RESULT '.json_encode(['status' => $response->getStatusCode()], JSON_THROW_ON_ERROR)."\n");
$kernel->terminate($request, $response);
