<?php
declare(strict_types=1);
use AgriBantay\Installation\InstallContract as C;
use AgriBantay\Installation\FoundationInstallChecks as Checks;
use AgriBantay\Installation\InstallSequence;
use AgriBantay\Preparation\B1RecordIntegrity;
use Illuminate\Database\Capsule\Manager;
use Illuminate\Database\Migrations\DatabaseMigrationRepository;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\Facade;
use App\Services\PoultryHouseFoundationReadiness as Readiness;
require __DIR__.'/InstallContract.php';
$pdo=null;$log=null;$locked=false;
try{
 if(PHP_SAPI!=='cli'||$argc!==3||!in_array($argv[1],['--execute-approved-unit','--verify-approved-runtime'],true))throw new RuntimeException('PH_NO_UNIT_AUTHORITY');
 $context=$argv[2];if(!preg_match('~\A'.preg_quote(C::ROOT,'~').'/authority/unit-([1-5])\.json\z~',str_replace('\\','/',$context),$match)||!is_file($context)||is_link($context))throw new RuntimeException('PH_FIXED_UNIT_CONTEXT');
 $unit=(int)$match[1];$a=C::authority(json_decode(file_get_contents($context),true,512,JSON_THROW_ON_ERROR),$unit);
 if(getenv('PH_INSTALL_SUPERVISED_CONTEXT_SHA256')!==hash_file('sha256',$context))throw new RuntimeException('PH_SUPERVISED_ENTRY_REQUIRED');
 C::pins($a['tool_manifest_sha256']);
 C::nativeEvidence($a);
 require C::WORK.'/backend/vendor/autoload.php';require __DIR__.'/FoundationInstallChecks.php';require __DIR__.'/InstallSequence.php';require C::WORK.'/backend/scripts/poultry-house-preparation/B1RecordIntegrity.php';
 $guard=new Symfony\Component\Process\Process(['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe','-NoProfile','-NonInteractive','-File',__DIR__.'/InstallationStorage.ps1','-Verify','-RequireExecutionHold']);$guard->setTimeout(15);$guard->mustRun();$g=json_decode($guard->getOutput(),true,512,JSON_THROW_ON_ERROR);if(!($g['passed']??false))throw new RuntimeException('PH_PRIVATE_LAYOUT_REQUIRED');
 $cpFile=C::ROOT.'/checkpoints/held-baseline.json';if(!is_file($cpFile)||is_link($cpFile)||!hash_equals($a['checkpoint_sha256'],hash_file('sha256',$cpFile)))throw new RuntimeException('PH_CHECKPOINT_BINDING');$checkpoint=json_decode(file_get_contents($cpFile),true,512,JSON_THROW_ON_ERROR);$accepted=C::ROOT.'/preparation/accepted-b1-database-checkpoint.json';if(hash_file('sha256',$accepted)!==C::B1_SNAPSHOT)throw new RuntimeException('PH_B1_CHECKPOINT_PIN');C::checkpoint($checkpoint,$a,json_decode(file_get_contents($accepted),true,512,JSON_THROW_ON_ERROR));
 if(hash_file('sha256',__DIR__.'/PRIVILEGE-PLAN.json')!==$a['privilege_plan_sha256'])throw new RuntimeException('PH_PRIVILEGE_PLAN_BINDING');
 $private=json_decode(stream_get_contents(STDIN,16385),true,512,JSON_THROW_ON_ERROR);$mapping=C::mapping($private['mapping']??[]);unset($private);
 $pdo=new PDO('mysql:host=127.0.0.1;port=3306;dbname=db_agribantay;charset=utf8mb4',$mapping['username'],$mapping['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false,PDO::MYSQL_ATTR_MULTI_STATEMENTS=>false,PDO::ATTR_TIMEOUT=>5]);unset($mapping);
 C::identity($pdo->query('SELECT VERSION() AS version,@@version_comment AS comment,@@port AS port,@@datadir AS datadir,DATABASE() AS db,@@hostname AS hostname,@@server_id AS server_id,@@server_uuid AS server_uuid')->fetch());
 $modes=$pdo->query('SELECT @@session.sql_mode AS modes,@@foreign_key_checks AS fk_checks,@@innodb_strict_mode AS strict_mode,@@log_bin AS bin,@@binlog_format AS format,@@log_bin_trust_function_creators AS trust')->fetch();if(!str_contains($modes['modes'],'STRICT_TRANS_TABLES')||(int)$modes['fk_checks']!==1||(int)$modes['strict_mode']!==1||(int)$modes['bin']!==1||$modes['format']!=='ROW'||(int)$modes['trust']!==0)throw new RuntimeException('PH_REQUIRED_ENFORCEMENT_OR_LOGGING');
 $creatorHash=hash('sha256',(string)$pdo->query('SELECT CURRENT_USER()')->fetchColumn());
 $capsule=new Manager;$capsule->addConnection(['driver'=>'mysql','host'=>'127.0.0.1','port'=>3306,'database'=>'db_agribantay','username'=>'explicit-private-pdo-only','password'=>'','charset'=>'utf8mb4','collation'=>'utf8mb4_unicode_ci','prefix'=>'']);$db=$capsule->getConnection();$db->setPdo($pdo);$db->setReadPdo($pdo);$container=$capsule->getContainer();$container->instance('db',$capsule->getDatabaseManager());$container->bind('db.schema',fn()=>$db->getSchemaBuilder());Facade::clearResolvedInstances();Facade::setFacadeApplication($container);
 $checks=new Checks(C::WORK.'/backend');$paths=$checks->verifyFiles();$names=array_map(static fn($p)=>basename($p,'.php'),array_slice(array_keys($checks->manifest['files']),0,4));
 $base=$checkpoint['snapshot'];$projection=Checks::baselineFromSnapshot($base);$originalJournal=$checkpoint['journal'];
 $journal=static function()use($checks,$pdo,$originalJournal,$names,$unit,$argv){$all=$checks->journal($pdo);$done=$argv[1]==='--verify-approved-runtime'?4:min($unit-1,4);if(count($all)!==count($originalJournal)+$done||array_slice($all,0,count($originalJournal))!=$originalJournal)throw new RuntimeException('PH_ORIGINAL_JOURNAL_OR_STAGE');foreach(array_slice($all,count($originalJournal)) as $i=>$row)if($row['migration']!==$names[$i]||(int)$row['batch']!==50+$i)throw new RuntimeException('PH_COMPLETION_HISTORY');return $all;};
 $writeLog=static function(string $state)use(&$log,$unit){$line=json_encode(['utc'=>gmdate('c'),'unit'=>$unit,'state'=>$state],JSON_THROW_ON_ERROR)."\n";if(!$log||fwrite($log,$line)!==strlen($line)||!fflush($log)||!fsync($log))throw new RuntimeException('PH_CHECKPOINT_IO');};
 $deadline=static function()use($a,$checkpoint){if(time()>=strtotime($a['first_hold_utc'])+600)throw new RuntimeException('PH_WORK_CUTOFF');C::capacity((int)($checkpoint['initial_free_bytes']??0),(int)disk_free_space('C:/'));};
 if($argv[1]==='--verify-approved-runtime'){
  if($unit!==5||($a['runtime_verification_authorized']??false)!==true||($a['runtime_principal_sha256']??'')!==$creatorHash||$creatorHash===C::CREATOR||$pdo->query('SELECT CURRENT_ROLE()')->fetchColumn()!=='NONE')throw new RuntimeException('PH_RUNTIME_IDENTITY');
  $plan=json_decode(file_get_contents(__DIR__.'/PRIVILEGE-PLAN.json'),true,512,JSON_THROW_ON_ERROR);if($creatorHash!==$plan['runtime_account']['expected_principal_sha256'])throw new RuntimeException('PH_PLANNED_RUNTIME_IDENTITY');C::runtimeGrants($pdo->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN),$plan['runtime_table_grants']);
  $env=Dotenv\Dotenv::createArrayBacked(C::WORK.'/backend')->load();if(($env['DB_USERNAME']??'')!==($a['runtime_username']??'')||($env['DB_CONNECTION']??'')!=='mysql'||!in_array($env['DB_HOST']??'',['127.0.0.1','localhost'],true)||($env['DB_PORT']??'3306')!=='3306'||($env['DB_DATABASE']??'')!=='db_agribantay'||!empty($env['DB_URL'])||!empty($env['DATABASE_URL'])||!empty($env['DB_SOCKET'])||is_file(C::WORK.'/backend/bootstrap/cache/config.php'))throw new RuntimeException('PH_RUNTIME_CONFIGURATION_NOT_SWITCHED');unset($env);
  $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');$journal();$checks->preserved($pdo,$projection);$foreign=$checks->foreignIntegrity($pdo);$ready=(new Readiness)->inspect();if(!($ready['ready']??false))throw new RuntimeException('PH_RESTRICTED_READINESS');$pdo->rollBack();$deadline();
  echo json_encode(['passed'=>true,'restricted_runtime_verified'=>true,'foreign_keys'=>$foreign,'ready'=>$ready,'operator_resumption_confirmation_still_required'=>true],JSON_THROW_ON_ERROR),PHP_EOL;exit(0);
 }
 if($creatorHash!==C::CREATOR)throw new RuntimeException('PH_APPROVED_DURABLE_CREATOR');
 $quiet=static function()use($pdo){foreach([
 'SELECT COUNT(*) FROM jobs','SELECT COUNT(*) FROM failed_jobs','SELECT COUNT(*) FROM job_batches WHERE pending_jobs<>0 OR (finished_at IS NULL AND cancelled_at IS NULL)',
 'SELECT COUNT(*) FROM farm_sms_alert_states WHERE pending_token IS NOT NULL OR pending_outcome IS NOT NULL OR pending_started_at IS NOT NULL OR retry_after IS NOT NULL',
 "SELECT COUNT(*) FROM sms_logs WHERE LOWER(status) IN ('sending','pending','retrying','unknown')",'SELECT COUNT(*) FROM information_schema.INNODB_TRX WHERE trx_mysql_thread_id<>CONNECTION_ID()',
 'SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND DB=DATABASE()',
 "SELECT COUNT(*) FROM performance_schema.threads WHERE TYPE='FOREGROUND' AND PROCESSLIST_ID IS NOT NULL AND PROCESSLIST_ID<>CONNECTION_ID() AND NOT (NAME IN ('thread/sql/event_scheduler','thread/sql/compress_gtid_table') AND PROCESSLIST_COMMAND='Daemon')",
 'SELECT COUNT(DISTINCT l.OWNER_THREAD_ID) FROM performance_schema.metadata_locks l JOIN performance_schema.threads t ON t.THREAD_ID=l.OWNER_THREAD_ID WHERE l.OBJECT_SCHEMA=DATABASE() AND COALESCE(t.PROCESSLIST_ID,0)<>CONNECTION_ID()'
 ] as $sql)if((int)$pdo->query($sql)->fetchColumn()!==0)throw new RuntimeException('PH_DRAIN_OR_PROVIDER_NOT_CLEAR');};
 $quiet();$deadline();$journal();
 if($unit===1){$pdo->exec('SET SESSION information_schema_stats_expiry=0');$pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');if(B1RecordIntegrity::snapshot($pdo)!==$base)throw new RuntimeException('PH_HELD_DATABASE_DRIFT');$pdo->rollBack();$pdo->exec('SET SESSION TRANSACTION READ WRITE');}
 else{$checks->preserved($pdo,$projection);$checks->verifyObjects($pdo,min($unit-1,4));}
 if((int)$pdo->query("SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()")->fetchColumn()!==0)throw new RuntimeException('PH_UNEXPECTED_ROUTINE_BEFORE_UNIT');
 foreach(['VIEWS'=>'TABLE_SCHEMA','EVENTS'=>'EVENT_SCHEMA'] as $catalog=>$schema)if((int)$pdo->query('SELECT COUNT(*) FROM information_schema.'.$catalog.' WHERE '.$schema.'=DATABASE()')->fetchColumn())throw new RuntimeException('PH_UNEXPECTED_STORED_OBJECT');
 if((int)$pdo->query('SELECT GET_LOCK(\'agribantay:reviewed-house-installation\',0)')->fetchColumn()!==1)throw new RuntimeException('PH_INSTALLER_LOCK');$locked=true;
 $log=fopen(C::ROOT.'/checkpoints/unit-'.$unit.'.jsonl','x');if(!$log)throw new RuntimeException('PH_EXCLUSIVE_CHECKPOINT');
 $pdo->exec('SET SESSION lock_wait_timeout=5');$pdo->exec('SET SESSION innodb_lock_wait_timeout=5');
 $before=$checks->journal($pdo);
 $result=InstallSequence::one($a,$unit,[
  'preflight'=>static function()use($quiet,$deadline,$checks){$quiet();$deadline();$checks->verifyFiles();},'checkpoint'=>$writeLog,
  'execute'=>static function()use($unit,$capsule,$paths,$names,$pdo){if($unit===5){$pdo->exec(Readiness::auditProcedureSql('mysql'));return;}$migrator=new Migrator(new DatabaseMigrationRepository($capsule->getDatabaseManager(),'migrations'),$capsule->getDatabaseManager(),new Filesystem);$file=$paths['database/migrations/'.$names[$unit-1].'.php'];if(array_values($migrator->run([$file],['step'=>true]))!==[$file])throw new RuntimeException('PH_EXACT_FILE_COMPLETION');},
  'journal'=>static function()use($checks,$pdo,$before,$unit,$names){$after=$checks->journal($pdo);if($unit===5){if($after!==$before)throw new RuntimeException('PH_PROCEDURE_CHANGED_JOURNAL');return;}$add=array_slice($after,count($before));if(array_slice($after,0,count($before))!==$before||count($add)!==1||$add[0]['migration']!==$names[$unit-1]||(int)$add[0]['batch']!==49+$unit)throw new RuntimeException('PH_GENUINE_JOURNAL_ADDITION');},
  'preservation'=>static function()use($checks,$pdo,$projection){$checks->preserved($pdo,$projection);},
  'objects'=>static function()use($checks,$pdo,$unit){$objects=$checks->verifyObjects($pdo,min($unit,4));$foreign=$checks->foreignIntegrity($pdo);if($unit===5)$objects['procedure']=$checks->verifyProcedure($pdo,C::CREATOR);return ['verified'=>true,'foreign_keys'=>$foreign,'procedure'=>$objects['procedure']??null];},'deadline'=>$deadline,
 ]);
 echo json_encode($result,JSON_THROW_ON_ERROR),PHP_EOL;
}catch(Throwable $e){if($pdo&&$pdo->inTransaction())$pdo->rollBack();echo json_encode(['passed'=>false,'reason'=>preg_match('/\APH_[A-Z0-9_]+\z/',$e->getMessage())?$e->getMessage():'PH_SANITIZED_UNIT_STOP','completion_unknown_if_started'=>true,'no_automatic_retry_or_repair'=>true],JSON_THROW_ON_ERROR),PHP_EOL;exit(2);
}finally{if(is_resource($log))fclose($log);if($locked&&$pdo)$pdo->query('SELECT RELEASE_LOCK(\'agribantay:reviewed-house-installation\')');$pdo=null;}
