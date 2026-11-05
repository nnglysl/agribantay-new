<?php

// Standalone local metadata audit. Never boots Laravel or invokes HTTP/jobs.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$base = dirname(__DIR__, 2);
$env = Dotenv\Dotenv::createArrayBacked($base)->load();
if (! in_array($env['DB_HOST'] ?? '', ['127.0.0.1', 'localhost', '::1'], true) || ! empty($env['DB_URL'])) {
    exit(2);
}
$pdo = new PDO('mysql:host='.$env['DB_HOST'].';port='.($env['DB_PORT'] ?? '3306').';dbname='.$env['DB_DATABASE'],
    $env['DB_USERNAME'], $env['DB_PASSWORD'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('START TRANSACTION READ ONLY');
$out = [];
$applied = $pdo->query('SELECT migration FROM migrations ORDER BY migration')->fetchAll(PDO::FETCH_COLUMN);
$files = array_map(fn ($p) => basename($p, '.php'), glob($base.'/database/migrations/*.php'));
sort($files);
$out['pending_migrations'] = array_values(array_diff($files, $applied));
$out['applied_count'] = count($applied);
$out['triggers'] = $pdo->query('SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()')->fetchAll(PDO::FETCH_ASSOC);
$out['role_counts'] = $pdo->query('SELECT role, status, COUNT(*) AS total FROM users GROUP BY role,status ORDER BY role,status')->fetchAll(PDO::FETCH_ASSOC);
$out['device_assignments'] = $pdo->query('SELECT status,COUNT(*) AS devices,SUM(farm_id IS NOT NULL) AS assigned FROM sensors GROUP BY status')->fetchAll(PDO::FETCH_ASSOC);
$out['indexes'] = $pdo->query("SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name,NON_UNIQUE AS non_unique,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_list FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','farms','sensors','sensor_readings','alert_history','device_assignment_events','generated_reports','password_reset_otps','maintenance_notifications') GROUP BY TABLE_NAME,INDEX_NAME,NON_UNIQUE ORDER BY TABLE_NAME,INDEX_NAME")->fetchAll(PDO::FETCH_ASSOC);
$out['legacy_assignment_ledger_count'] = (int) $pdo->query('SELECT COUNT(*) FROM device_assignment_events')->fetchColumn();
$out['maintenance_notifications'] = $pdo->query('SELECT event,COUNT(*) AS total FROM maintenance_notifications GROUP BY event ORDER BY event')->fetchAll(PDO::FETCH_ASSOC);
$out['document_table_exists'] = (bool) $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='farm_control_documents'")->fetchColumn();
$out['voltage_column_exists'] = (bool) $pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sensor_readings' AND COLUMN_NAME='ammonia_adc_mv'")->fetchColumn();
$out['orphan_counts'] = [
    'farms_without_owner' => (int) $pdo->query('SELECT COUNT(*) FROM farms f LEFT JOIN users u ON u.id=f.user_id WHERE u.id IS NULL')->fetchColumn(),
    'assigned_devices_without_farm' => (int) $pdo->query('SELECT COUNT(*) FROM sensors s LEFT JOIN farms f ON f.id=s.farm_id WHERE s.farm_id IS NOT NULL AND f.id IS NULL')->fetchColumn(),
];
$pdo->rollBack();
$out['local_configuration'] = [
    'production_environment' => ($env['APP_ENV'] ?? '') === 'production',
    'debug_enabled' => filter_var($env['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN),
    'annual_sms_enabled' => filter_var($env['ANNUAL_CLEANOUT_NOTIFICATIONS_ENABLED'] ?? false, FILTER_VALIDATE_BOOLEAN),
    'annual_start_date_present' => ! empty($env['ANNUAL_CLEANOUT_NOTIFICATION_START_DATE']),
];
foreach (['APP_KEY', 'APP_URL', 'FRONTEND_URL', 'MAIL_HOST', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'UNISMS_SECRET_KEY'] as $key) {
    $out['local_configuration'][$key.'_present'] = ! empty($env[$key]);
}
foreach (['storage', 'bootstrap/cache', 'storage/app/private'] as $dir) {
    $out['local_paths'][$dir] = ['exists' => is_dir($base.'/'.$dir), 'writable' => is_writable($base.'/'.$dir)];
}
$out['runtime'] = ['php' => PHP_VERSION];
foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'ctype', 'curl', 'xml', 'dom', 'tokenizer', 'session', 'filter'] as $ext) {
    $out['runtime'][$ext] = extension_loaded($ext);
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
