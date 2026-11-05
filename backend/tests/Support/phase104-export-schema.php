<?php

// Source access is metadata-only and READ ONLY. No source rows/credentials exported.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$directory = $argv[1] ?? '';
if (! is_dir($directory) || ! str_starts_with(strtolower(str_replace('\\','/',realpath($directory))),strtolower(str_replace('\\','/',realpath(sys_get_temp_dir()))).'/agribantay-phase104-mariadb-')) exit(2);
$e = Dotenv\Dotenv::createArrayBacked(dirname(__DIR__, 2))->load();
if (! in_array($e['DB_HOST'] ?? '', ['127.0.0.1','localhost','::1'], true) || ! empty($e['DB_URL'])) exit(3);
$pdo = new PDO('mysql:host='.$e['DB_HOST'].';port='.($e['DB_PORT']??3306).';dbname='.$e['DB_DATABASE'],$e['DB_USERNAME'],$e['DB_PASSWORD'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec('START TRANSACTION READ ONLY');
$required=['users','farms','sensors','sensor_readings','device_assignment_events','alert_history','farm_sms_alert_states','activity_logs','notifications','sms_logs','ai_recommendations','maintenance_logs','maintenance_notifications','manure_disposal_records','inspections','service_requests','service_request_attachments','generated_reports','password_reset_otps','email_verification_otps','personal_access_tokens','migrations'];
$available=$pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$tables=array_values(array_intersect($required,$available));
// Include only parent dependencies of the selected workflow tables.
$parents=$pdo->query('SELECT TABLE_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL')->fetchAll(PDO::FETCH_ASSOC);
do { $old=$tables; foreach($parents as $fk) if(in_array($fk['TABLE_NAME'],$tables,true)) $tables[]=$fk['REFERENCED_TABLE_NAME']; $tables=array_values(array_unique($tables)); } while($old!==$tables);
$schema=[];
foreach($tables as $table) { if(!preg_match('/\A[a-z_]+\z/',$table)) exit(4); $schema[$table]=preg_replace('/AUTO_INCREMENT=\d+/','',$pdo->query('SHOW CREATE TABLE `'.$table.'`')->fetch(PDO::FETCH_NUM)[1]); }
$pdo->rollBack();
file_put_contents($directory.'/schema.json',json_encode($schema,JSON_THROW_ON_ERROR));
echo json_encode(['metadata_tables'=>array_keys($schema),'source_rows_exported'=>0],JSON_THROW_ON_ERROR);
