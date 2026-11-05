<?php

// Standalone loopback metadata only; never boots Laravel or prints identities/secrets.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$env = Dotenv\Dotenv::createArrayBacked(dirname(__DIR__, 2))->load();
if (! in_array($env['DB_HOST'] ?? '', ['127.0.0.1', 'localhost', '::1'], true) || ! empty($env['DB_URL'])) {
    exit(2);
}
$pdo = new PDO('mysql:host='.$env['DB_HOST'].';port='.($env['DB_PORT'] ?? '3306').';dbname='.$env['DB_DATABASE'], $env['DB_USERNAME'], $env['DB_PASSWORD'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('START TRANSACTION READ ONLY');
$out = ['version' => $pdo->query('SELECT VERSION()')->fetchColumn()];
$out['users_engine'] = $pdo->query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'")->fetchColumn();
$out['account_columns'] = $pdo->query("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME IN ('id','role','status') ORDER BY ORDINAL_POSITION")->fetchAll(PDO::FETCH_ASSOC);
$out['users_parent_foreign_keys'] = $pdo->query("SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND REFERENCED_TABLE_NAME IS NOT NULL")->fetchAll(PDO::FETCH_ASSOC);
$out['super_admin_counts'] = $pdo->query("SELECT COUNT(*) AS total, SUM(status='active') AS active FROM users WHERE role='super_admin'")->fetch(PDO::FETCH_ASSOC);
$grants = implode("\n", $pdo->query('SHOW GRANTS FOR CURRENT_USER()')->fetchAll(PDO::FETCH_COLUMN));
$out['local_connection_has_broad_ddl_or_grant'] = (bool) preg_match('/ALL PRIVILEGES|\\b(?:ALTER|DROP|TRIGGER|CREATE USER|GRANT OPTION)\\b/i', $grants);
$out['privilege_scan_limit'] = 'Local direct grants only; production effective roles/definer privileges require an authorized review.';
$pdo->rollBack();
echo json_encode($out, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
