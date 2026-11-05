<?php

// Copy schema metadata only into a brand-new local test database. No source
// rows or credentials are copied, and no operational migrations are run.
require dirname(__DIR__, 2).'/vendor/autoload.php';
// Read source configuration without inheriting PHPUnit's overridden DB values.
$sourceEnv = Dotenv\Dotenv::createArrayBacked(dirname(__DIR__, 2))->load();
$host = $sourceEnv['DB_HOST'] ?? '';
if (! in_array($host, ['127.0.0.1', 'localhost', '::1'], true) || ! empty($sourceEnv['DB_URL'])) {
    exit(2);
}
$port = $sourceEnv['DB_PORT'] ?? '3306';
$source = new PDO('mysql:host='.$host.';port='.$port.';dbname='.$sourceEnv['DB_DATABASE'], $sourceEnv['DB_USERNAME'], $sourceEnv['DB_PASSWORD'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$source->exec('START TRANSACTION READ ONLY');
$schemas = [];
foreach ($source->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_NUM) as [$table]) {
    if (! preg_match('/\A[a-zA-Z0-9_]+\z/', $table)) {
        exit(3);
    }
    $schemas[] = preg_replace('/AUTO_INCREMENT=\d+/', '', $source->query('SHOW CREATE TABLE `'.$table.'`')->fetch(PDO::FETCH_NUM)[1]);
}
$source->rollBack();
$database = 'agribantay_phase4_test_'.bin2hex(random_bytes(6));
if (! preg_match('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', $database) || $database === $sourceEnv['DB_DATABASE']) {
    exit(4);
}
$target = new PDO('mysql:host='.$host.';port='.$port, $sourceEnv['DB_USERNAME'], $sourceEnv['DB_PASSWORD'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$target->exec('CREATE DATABASE `'.$database.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$target->exec('USE `'.$database.'`');
$target->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($schemas as $schema) {
    $target->exec($schema);
}
$target->exec('SET FOREIGN_KEY_CHECKS=1');
$insert = $target->prepare('INSERT INTO users (first_name,last_name,mobile_number,email,password,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NOW(),NOW())');
foreach (['super_admin', 'admin', 'vet', 'farm_owner'] as $i => $role) {
    $insert->execute(['Private', 'Fixture '.$role, '0900000000'.($i + 1), 'fixture-'.$i.'@example.test', password_hash('isolated-fixture-only', PASSWORD_BCRYPT), $role, 'active']);
}
$target->exec("INSERT INTO farms (user_id,farm_name,owner_name,mobile_number,barangay,address,farm_size,status,created_at,updated_at) VALUES (4,'Private fixture farm','Private Fixture farm_owner','09000000004','Calansayan','Private fixture address','Small','Active',NOW(),NOW())");
// Samples required by the older data-dependent display tests. These are
// synthetic fixture rows; no historical operational values are copied.
$target->exec("INSERT INTO alert_history (farm_id,sensor_type,status,value,triggered_at,created_at,updated_at) VALUES (1,'ammonia','Critical',25,'2026-10-15 20:00:00',NOW(),NOW())");
$target->exec("INSERT INTO maintenance_logs (farm_id,maintenance_type,performed_at,notes,photo_path,created_at,updated_at) VALUES (1,'Full Manure Clean-out','2026-10-15','Synthetic timezone fixture','fixture-only.jpg',NOW(),NOW())");
$target->exec("INSERT INTO generated_reports (report_name,period_start,period_end,report_type,generated_by_id,snapshot,created_at,updated_at) VALUES ('Synthetic timezone archive','2026-10-01','2026-10-31','Monthly',1,'{}','2026-10-15 20:00:00',NOW())");
echo $database;
