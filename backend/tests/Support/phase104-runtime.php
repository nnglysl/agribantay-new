<?php

require dirname(__DIR__,2).'/vendor/autoload.php';
$command=$argv[1]??'status';
$pdo=Tests\Support\Phase104Database::connect();
if($command==='status') {
    echo json_encode($pdo->query('SELECT VERSION() AS version,@@version_comment AS version_comment,@@port AS port,@@bind_address AS bind_address,@@datadir AS datadir,@@SESSION.sql_mode AS sql_mode')->fetch(),JSON_THROW_ON_ERROR);
} elseif($command==='create') {
    echo Tests\Support\Phase104Database::create();
} elseif($command==='seed-archive') {
    Tests\Support\Phase104Database::seedArchive(Tests\Support\Phase104Database::connect($argv[2]??'')); echo 'Synthetic archive fixture added.';
} elseif($command==='evidence') {
    $pdo=Tests\Support\Phase104Database::connect($argv[2]??'');
    echo json_encode([
        'identity'=>$pdo->query('SELECT VERSION() AS version,@@version_comment AS version_comment,@@port AS port,@@bind_address AS bind_address,@@SESSION.sql_mode AS sql_mode')->fetch(),
        'tables'=>$pdo->query("SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','farms','farm_control_documents') ORDER BY TABLE_NAME")->fetchAll(),
        'document_columns'=>$pdo->query("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='farm_control_documents' ORDER BY ORDINAL_POSITION")->fetchAll(),
        'guards'=>$pdo->query("SELECT TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,DEFINER,SQL_MODE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users' ORDER BY TRIGGER_NAME")->fetchAll(),
        'migrations'=>$pdo->query('SELECT migration FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN),
        'optional_voltage_column'=>(bool)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sensor_readings' AND COLUMN_NAME='ammonia_adc_mv'")->fetchColumn(),
    ],JSON_THROW_ON_ERROR);
} elseif($command==='shutdown') {
    $pdo->exec('SHUTDOWN'); echo 'Stopped isolated MariaDB server.';
} else throw new RuntimeException('Unknown private runtime operation.');
