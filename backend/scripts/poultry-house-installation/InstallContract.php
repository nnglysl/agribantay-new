<?php
declare(strict_types=1);
namespace AgriBantay\Installation;
use RuntimeException;
/** No connection, dotenv, Laravel bootstrap or filesystem mutation on import. */
final class InstallContract
{
 public const ROOT='C:/Users/glyselanne/AgriBantay-Poultry-House-Installation/20261104-ph-foundation';
 public const IDENTITY='3294ba2dfcbec9cef6b5923d6f23eead7abf82953cda0f6ab2104a0d1edab969';
 public const CREATOR='0a44f8735cbc275f1efcdf43159dcd20e54a1c994d0daeb92d04c389078057b5';
 public const PROCEDURE='4ad70ae116fdf4ee656fef7011c3f3198698ec40b397eecdf113606137e93e28';
 public const WORK='C:/xampp/htdocs/agribantay';
 public const B1_SNAPSHOT='e80b0a141d132091cba4afffde1dd1ad9f324555acb6816c4a9c138387215624';
 public const NATIVE_RECEIPT='8926d09c7aa5dd8808edd5399f7ef9129c359db8eaa4bf715942d3700164fd22';
 public const NATIVE_RECONCILIATION='8e49052dbbce1ddf7d2ac9e9e23317162bac73646ecbe542bfd9e3d2644ad778';
 public const REHEARSED_MANIFEST='243c3cd3d4a9a2e5e39669eb38738dabf0d46382147399ba8b967bb1d705cde7';
 public const RECONCILED_MANIFEST='d14b33ebcdf8be44e811023e730cd9cfa7eb38741dc4e55c6c307a757d773f84';
 public static function authority(array $c,int $unit,?int $now=null):array
 {
  $now??=time();$t=strtotime($c['first_hold_utc']??'');$deadline=strtotime($c['deadline_utc']??'');
  if(($c['kind']??'')!=='PH_SCHEMA_UNIT_EXECUTION_AUTHORITY'||($c['operator']??'')!=='glyselanne'||($c['unit']??null)!==$unit||$unit<1||$unit>5||($c['operator_confirmed']??false)!==true||($c['schema_only']??false)!==true||($c['execution_authorized']??false)!==true||($c['window_separately_approved']??false)!==true||($c['writers_held']??false)!==true||($c['providers_drained']??false)!==true||($c['held_checkpoint_accepted']??false)!==true||($c['privilege_plan_approved']??false)!==true||($c['durable_creator_sha256']??'')!==self::CREATOR||strlen($c['approval_reference']??'')<8||!$t||$deadline-$t!==900||$now<$t||$now>=$t+600||($unit>1&&($c['previous_unit_accepted']??false)!==true))throw new RuntimeException('PH_EXPLICIT_UNIT_AUTHORITY_REQUIRED');
  foreach(['tool_manifest_sha256','checkpoint_sha256','release_sha256','privilege_plan_sha256','native_validation_sha256'] as $name)if(!preg_match('/\A[a-f0-9]{64}\z/D',$c[$name]??''))throw new RuntimeException('PH_BOUND_EVIDENCE_REQUIRED');
  return $c;
 }
 public static function mapping(array $m):array
 {
  if(array_diff(array_keys($m),['host','port','database','username','password'])||($m['host']??'')!=='127.0.0.1'||($m['port']??null)!==3306||($m['database']??'')!=='db_agribantay'||!is_string($m['username']??null)||!preg_match('/\A[a-zA-Z0-9_]+\z/D',$m['username'])||!is_string($m['password']??null))throw new RuntimeException('PH_EXACT_INSTALLER_MAPPING_REQUIRED');return $m;
 }
 public static function identity(array $row):void
 {
  $row['port']=(int)$row['port'];$row['server_id']=(int)$row['server_id'];
  if(hash('sha256',json_encode($row,JSON_THROW_ON_ERROR))!==self::IDENTITY)throw new RuntimeException('PH_SOURCE_IDENTITY_REQUIRED');
 }
 public static function pins(string $expected):array
 {
  $file=__DIR__.'/INSTALLER-TOOLS.sha256.json';if(!is_file($file)||!hash_equals($expected,hash_file('sha256',$file)))throw new RuntimeException('PH_INSTALLER_MANIFEST_REQUIRED');$m=json_decode(file_get_contents($file),true,512,JSON_THROW_ON_ERROR);$seen=[];
  foreach($m['files'] as $f){$path=realpath(self::WORK.'/'.$f['path']);if(!$path||is_link($path)||!str_starts_with(str_replace('\\','/',$path),self::WORK.'/')||isset($seen[$f['path']])||!hash_equals($f['sha256'],hash_file('sha256',$path)))throw new RuntimeException('PH_INSTALLER_PIN_DRIFT');$seen[$f['path']]=true;}return $m;
 }
 public static function checkpoint(array $c,array $authority,array $acceptedSnapshot):void
 {
  if(($c['kind']??'')!=='PH_HELD_INSTALLATION_CHECKPOINT'||($c['held']??false)!==true||($c['identity_sha256']??'')!==self::IDENTITY||($c['source_all_tables_exact_to_b1']??false)!==true||($c['release_sha256']??'')!==$authority['release_sha256']||($c['tool_manifest_sha256']??'')!==$authority['tool_manifest_sha256']||($c['privilege_plan_sha256']??'')!==$authority['privilege_plan_sha256']||($c['b1_recovery_accepted']??false)!==true||($c['current_release_reconciliation_accepted']??false)!==true||($c['snapshot']??null)!==$acceptedSnapshot)throw new RuntimeException('PH_FINAL_HELD_CHECKPOINT_REQUIRED');
  self::capacity((int)($c['initial_free_bytes']??0),(int)($c['initial_free_bytes']??0));
 }
 public static function capacity(int $initial,int $current):void{if($initial<19327352832||$current<10737418240||$initial-$current>8589934592)throw new RuntimeException('PH_CAPACITY_STOP');}
 public static function runtimeGrants(array $grants,array $tables):void
 {
  $seen=[];$procedure=false;
  foreach($grants as $grant){if(preg_match('/\AGRANT USAGE ON \*\.\* TO /',$grant)&&!str_contains($grant,'WITH GRANT OPTION'))continue;
   if(preg_match('/\AGRANT EXECUTE ON PROCEDURE `db_agribantay`\.`agribantay_house_safeguards_v1` TO /',$grant)&&!str_contains($grant,'WITH GRANT OPTION')){$procedure=true;continue;}
   if(!preg_match('/\AGRANT ([A-Z, ]+) ON `db_agribantay`\.`([a-z0-9_]+)` TO /',$grant,$m)||str_contains($grant,'WITH GRANT OPTION')||!isset($tables[$m[2]]))throw new RuntimeException('PH_RUNTIME_GRANT_SCOPE');
   $actual=explode(', ',$m[1]);sort($actual);$required=$tables[$m[2]];sort($required);if($actual!==$required||isset($seen[$m[2]]))throw new RuntimeException('PH_RUNTIME_GRANT_RIGHTS');$seen[$m[2]]=true;
  }
  if(!$procedure||array_diff(array_keys($tables),array_keys($seen)))throw new RuntimeException('PH_RUNTIME_GRANTS_INCOMPLETE');
 }
 /** Read immutable evidence only; no app bootstrap, credentials, PDO or output creation. */
 public static function nativeEvidence(array $a):void
 {
  $e=[];
  foreach(['native'=>self::ROOT.'/preparation/native-validation.json','reconciliation'=>self::ROOT.'/preparation/native-validation-manifest-reconciliation.json','historical'=>__DIR__.'/NATIVE-REHEARSED-MANIFEST.json','approved'=>__DIR__.'/NATIVE-RECONCILED-MANIFEST.json','current'=>__DIR__.'/INSTALLER-TOOLS.sha256.json'] as $name=>$file){
   if(!is_file($file)||is_link($file)||!is_readable($file))throw new RuntimeException('PH_NATIVE_VALIDATION_REQUIRED');
   $e[$name]=file_get_contents($file);
  }
  self::nativeValidation(json_decode($e['native'],true,512,JSON_THROW_ON_ERROR),$a,$e);
 }
 public static function nativeValidation(array $v,array $a,?array $evidence=null):void
 {
  if(($v['kind']??'')!=='PH_NATIVE_INSTALLER_VALIDATION'||($v['passed']??false)!==true||($v['synthetic_only']??false)!==true||($v['actual_native_execution']??false)!==true||($v['source_database_accessed']??true)!==false||($v['server_version']??'')!=='8.0.46'||($v['port']??null)!==3312||($v['log_bin']??null)!==1||($v['binlog_format']??'')!=='ROW'||($v['trust_creators']??null)!==0||($v['privilege_plan_sha256']??'')!==$a['privilege_plan_sha256'])throw new RuntimeException('PH_NATIVE_VALIDATION_REQUIRED');
  foreach(['four_genuine_completions','original_rows_preserved','exact_procedure_and_common_definer','trigger_activation','restricted_runtime','runtime_escape_refused','lost_definer_refused','failure_preservation','bounded_completion'] as $check)if(($v['checks'][$check]??false)!==true)throw new RuntimeException('PH_NATIVE_VALIDATION_REQUIRED');
  if($evidence===null){if(($v['tool_manifest_sha256']??'')!==$a['tool_manifest_sha256'])throw new RuntimeException('PH_NATIVE_VALIDATION_REQUIRED');return;}
  foreach(['native'=>self::NATIVE_RECEIPT,'reconciliation'=>self::NATIVE_RECONCILIATION,'historical'=>self::REHEARSED_MANIFEST,'approved'=>self::RECONCILED_MANIFEST,'current'=>$a['tool_manifest_sha256']] as $name=>$hash){
   if(!is_string($evidence[$name]??null)||!hash_equals($hash,hash('sha256',$evidence[$name])))throw new RuntimeException('PH_NATIVE_RECONCILIATION_REQUIRED');
  }
  $r=json_decode($evidence['reconciliation'],true,512,JSON_THROW_ON_ERROR);
  if(json_decode($evidence['native'],true,512,JSON_THROW_ON_ERROR)!==$v||($a['native_validation_sha256']??'')!==self::NATIVE_RECEIPT||$v['tool_manifest_sha256']!==self::REHEARSED_MANIFEST||$r['historical_native_receipt_sha256']!==self::NATIVE_RECEIPT||$r['historical_manifest_sha256']!==self::REHEARSED_MANIFEST||$r['current_manifest_sha256']!==self::RECONCILED_MANIFEST||$r['historical_validation_rewritten']!==false||$r['new_manifest_claimed_rehearsed']!==false||$r['execution_authorized']!==false)throw new RuntimeException('PH_NATIVE_RECONCILIATION_REQUIRED');
  $historical=json_decode($evidence['historical'],true,512,JSON_THROW_ON_ERROR);$approved=json_decode($evidence['approved'],true,512,JSON_THROW_ON_ERROR);$current=json_decode($evidence['current'],true,512,JSON_THROW_ON_ERROR);
  $files=static function(array $m):array{$out=[];foreach($m['files']??[] as $f){if(!is_array($f)||array_keys($f)!==['path','sha256']||!is_string($f['path']??null)||isset($out[$f['path']])||!preg_match('/\A[a-f0-9]{64}\z/D',$f['sha256']??''))throw new RuntimeException('PH_NATIVE_MANIFEST_SCOPE');$out[$f['path']]=$f['sha256'];}ksort($out);return $out;};
  $old=$files($historical);$base=$files($approved);$now=$files($current);
  foreach($r['scope'] as $change){if(($old[$change['path']]??null)!==$change['historical_sha256'])throw new RuntimeException('PH_NATIVE_MANIFEST_SCOPE');$old[$change['path']]=$change['current_sha256'];}
  if($old!==$base)throw new RuntimeException('PH_NATIVE_MANIFEST_SCOPE');
  // This preparation correction is not another native rehearsal. Future unit authority
  // must bind the refreshed manifest; only these reviewed compatibility paths may differ.
  foreach(['backend/scripts/poultry-house-installation/InstallContract.php','backend/scripts/poultry-house-installation/InstallUnit.php','backend/scripts/poultry-house-installation/PHInstall.mjs','backend/tests/Unit/PoultryHouseOperationalInstallerTest.php'] as $path){if(!isset($now[$path]))throw new RuntimeException('PH_NATIVE_MANIFEST_SCOPE');$base[$path]=$now[$path];}
  $base['backend/scripts/poultry-house-installation/NATIVE-REHEARSED-MANIFEST.json']=self::REHEARSED_MANIFEST;
  $base['backend/scripts/poultry-house-installation/NATIVE-RECONCILED-MANIFEST.json']=self::RECONCILED_MANIFEST;ksort($base);
  if($base!==$now)throw new RuntimeException('PH_NATIVE_MANIFEST_SCOPE');
  unset($historical['files'],$approved['files'],$current['files']);
  if($historical!==$approved||$approved!==$current)throw new RuntimeException('PH_NATIVE_MANIFEST_SCOPE');
 }
}
