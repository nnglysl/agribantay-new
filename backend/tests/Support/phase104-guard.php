<?php

require dirname(__DIR__, 2).'/vendor/autoload.php';
$settings = Tests\Support\Phase104Database::settings();
$database = getenv('DB_DATABASE') ?: '';
Tests\Support\Phase104Database::connect($database);
foreach (['DB_CONNECTION'=>'mysql','DB_HOST'=>'127.0.0.1','DB_PORT'=>'3307','DB_DATABASE'=>$database,'DB_USERNAME'=>$settings['username'],'DB_PASSWORD'=>$settings['password'],'DB_URL'=>'','DB_SOCKET'=>'','LOG_CHANNEL'=>'null','CACHE_STORE'=>'array','SESSION_DRIVER'=>'array','MAIL_MAILER'=>'array','QUEUE_CONNECTION'=>'sync'] as $key=>$value) {
    putenv($key.'='.$value); $_ENV[$key]=$value; $_SERVER[$key]=$value;
}
if (is_file(dirname(__DIR__,2).'/bootstrap/cache/config.php')) throw new RuntimeException('Cached application configuration is not permitted in the isolated runtime test.');
