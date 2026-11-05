<?php
declare(strict_types=1);
namespace AgriBantay\Installation;
/** Same unit order in production and synthetic callback tests. No automatic continuation/retry. */
final class InstallSequence
{
 public static function one(array $authority,int $unit,array $hooks):array
 {
  InstallContract::authority($authority,$unit);$started=false;
  try{
   $hooks['preflight']();$hooks['checkpoint']('starting');$started=true;
   $hooks['execute']();$hooks['journal']();$hooks['preservation']();$objects=$hooks['objects']();
   $hooks['deadline']();$hooks['checkpoint']('verified');
   return ['passed'=>true,'unit'=>$unit,'objects'=>$objects,'resume_authorized'=>false,'next_unit_automatic'=>false];
  }catch(\Throwable $e){if($started)$hooks['checkpoint']('stopped_inspect_committed_ddl');throw $e;}
 }
}
