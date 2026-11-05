<?php

// Raw native concurrency worker. No Laravel bootstrap, providers, or production mapping.
require dirname(__DIR__, 2).'/vendor/autoload.php';
require __DIR__.'/PoultryHouseDatabase.php';

use Tests\Support\PoultryHouseDatabase;

[$script, $database, $action, $device, $farm, $house, $event] = $argv;
PoultryHouseDatabase::fixtureConnection($database); // Strict disposable namespace guard.
$pdo = PoultryHouseDatabase::server();
$pdo->exec('USE `'.$database.'`');
$pdo->exec('SET SESSION innodb_lock_wait_timeout=10');
echo "READY\n";
flush();
try {
    if ($action === 'associate') {
        $query = $pdo->prepare('UPDATE sensors SET farm_id=?,poultry_house_id=?,current_assignment_event_id=?,status=\'Active\' WHERE id=?');
        $query->execute([(int) $farm, (int) $house, (int) $event, (int) $device]);
    } elseif ($action === 'deactivate') {
        $query = $pdo->prepare('UPDATE poultry_houses SET status=\'Inactive\' WHERE id=?');
        $query->execute([(int) $house]);
    } elseif ($action === 'farm_assign') {
        $query = $pdo->prepare('UPDATE sensors SET farm_id=? WHERE id=?');
        $query->execute([(int) $farm, (int) $device]);
    } else {
        exit(2);
    }
    echo "ACCEPTED\n";
} catch (PDOException $error) {
    // SQLSTATE only; no credentials, row contents, or raw exception text.
    echo 'REJECTED:'.($error->errorInfo[0] ?? 'unknown')."\n";
}
