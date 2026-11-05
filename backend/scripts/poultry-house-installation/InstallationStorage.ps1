param([switch]$Prepare,[switch]$Verify,[switch]$RequireExecutionHold)
$ErrorActionPreference='Stop'
$phRoot='C:\Users\glyselanne\AgriBantay-Poultry-House-Installation\20261104-ph-foundation'
$phSid='S-1-5-21-3183497624-2616617678-60668805-1001'
try{
 if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $phSid){throw 'PH_CUSTODIAN'}
 function Safe-Path([string]$p){$c=[IO.Path]::GetFullPath($p);while($c){if((Test-Path -LiteralPath $c) -and ((Get-Item -LiteralPath $c -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PH_STORAGE_LINK'};$c=Split-Path -Parent $c}}
 function Private-Directory([string]$p){if(Test-Path -LiteralPath $p){throw 'PH_EXCLUSIVE_DIRECTORY'};[void][IO.Directory]::CreateDirectory($p);$a=[Security.AccessControl.DirectorySecurity]::new();$a.SetAccessRuleProtection($true,$false);$a.SetOwner([Security.Principal.SecurityIdentifier]::new($phSid));foreach($s in @($phSid,'S-1-5-18')){[void]$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($s),[Security.AccessControl.FileSystemRights]::FullControl,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))};Set-Acl -LiteralPath $p -AclObject $a}
 Safe-Path $phRoot
 $phFree=([IO.DriveInfo]::new('C:\')).AvailableFreeSpace;if($phFree -lt 19327352832){throw 'PH_INITIAL_CAPACITY'}
 if($Prepare){
  $c=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'PREPARATION-AUTHORITY.json') -Raw|ConvertFrom-Json
  if($c.kind -ne 'PH_INSTALLER_PREPARATION_ONLY_AUTHORITY' -or !$c.layout_preparation_approved -or $c.execution_authorized -ne $false -or $c.operator -ne 'glyselanne' -or $c.root -cne $phRoot -or [DateTimeOffset]::Parse($c.expires_utc) -le [DateTimeOffset]::UtcNow){throw 'PH_PREPARATION_AUTHORITY'}
  if(Test-Path -LiteralPath $phRoot){throw 'PH_NONEMPTY_OR_EXISTING_PREPARATION_ROOT'}
  $parent=Split-Path -Parent $phRoot;if(!(Test-Path -LiteralPath $parent)){Private-Directory $parent}
  Private-Directory $phRoot;foreach($n in @('preparation','authority','checkpoints','evidence','private')){Private-Directory (Join-Path $phRoot $n)}
 }
 if(!(Test-Path -LiteralPath $phRoot)){throw 'PH_PREPARED_ROOT_REQUIRED'}
 $top=@(Get-ChildItem -LiteralPath $phRoot -Force|Sort-Object Name);if(($top.Name -join '|') -cne 'authority|checkpoints|evidence|preparation|private'){throw 'PH_UNKNOWN_ROOT_ENTRY'}
 foreach($i in @((Get-Item -LiteralPath $phRoot -Force))+$top+@(Get-ChildItem -LiteralPath $phRoot -Recurse -Force)){
  if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PH_STORAGE_LINK'};$a=Get-Acl -LiteralPath $i.FullName;$r=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $phSid -or $r.Count -ne 2){throw 'PH_PRIVATE_ACL'};foreach($rule in $r){if($rule.IdentityReference.Value -notin @($phSid,'S-1-5-18') -or $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl'){throw 'PH_PRIVATE_ACL'}}
 }
 if($RequireExecutionHold){
  if(@(Get-NetTCPConnection -State Listen|Where-Object {$_.LocalPort -in @(8000,5173)}).Count){throw 'PH_APP_LISTENERS_NOT_CLOSED'}
  foreach($p in @(Get-CimInstance Win32_Process)){if($p.Name -match '^(?:httpd|nginx|w3wp|iisexpress|mysql|mysqldump)\.exe$' -or ($p.Name -in @('php.exe','node.exe') -and $p.CommandLine -match '(?:artisan (?:serve|queue:|schedule:)|vite(?:\.js)?(?:\x22)?\s|--test|phpunit)')){throw 'PH_UNEXPECTED_WRITER_PROCESS'}}
  if((Get-Service -Name MySQL80).Status -ne 'Running'){throw 'PH_MYSQL80_NOT_RUNNING'}
 }
 [pscustomobject]@{passed=$true;root=$phRoot;custodian_system_only=$true;safe_ancestry=$true;free_bytes=$phFree;execution_hold_checked=[bool]$RequireExecutionHold;created=[bool]$Prepare;operational_process_control=$false}|ConvertTo-Json -Compress
}catch{[pscustomobject]@{passed=$false;reason=if($_.Exception.Message -like 'PH_*'){$_.Exception.Message}else{'PH_SANITIZED_STORAGE_STOP'}}|ConvertTo-Json -Compress;exit 2}
