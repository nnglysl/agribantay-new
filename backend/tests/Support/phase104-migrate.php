<?php

require __DIR__.'/phase104-guard.php';
$path=$argv[1]??'';
$allowed=['database/approval-required/2026_10_31_130000_protect_sole_super_admin_mariadb.php','database/migrations/2026_10_31_000000_create_farm_control_documents_table.php'];
if(!in_array($path,$allowed,true)) throw new RuntimeException('Only the two reviewed exact test migration paths are allowed.');
$app=require dirname(__DIR__,2).'/bootstrap/app.php';
$kernel=$app->make(Illuminate\Contracts\Console\Kernel::class); $kernel->bootstrap();
$db=Illuminate\Support\Facades\DB::connection();
Tests\Support\Phase104Database::connect($db->getDatabaseName());
if($db->getConfig('host')!=='127.0.0.1' || (int)$db->getConfig('port')!==3307) throw new RuntimeException('Unexpected configured target.');
$exit=$kernel->call('migrate',['--path'=>[$path],'--force'=>true,'--no-interaction'=>true]);
echo $kernel->output();
echo json_encode(['version'=>$db->selectOne('SELECT VERSION() AS version')->version,'applied'=>$db->table('migrations')->orderBy('migration')->pluck('migration')->all(),'voltage_present'=>$db->getSchemaBuilder()->hasColumn('sensor_readings','ammonia_adc_mv')],JSON_THROW_ON_ERROR)."\n";
exit($exit);
