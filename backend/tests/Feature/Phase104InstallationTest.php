<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\Support\Phase104Database;
use Tests\TestCase;

class Phase104InstallationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if(getenv('PHASE104_TEST_MARIADB')!=='1') $this->markTestSkipped('Isolated native MariaDB required.');
        Phase104Database::connect(DB::connection()->getDatabaseName());
    }
    private function migration() { return require database_path('approval-required/2026_10_31_130000_protect_sole_super_admin_mariadb.php'); }
    private function connection(string $name,string $database,?string $user=null,?string $password=null)
    {
        $base=config('database.connections.mysql');
        config(['database.connections.'.$name=>array_replace($base,['database'=>$database,'username'=>$user??$base['username'],'password'=>$password??$base['password'],'url'=>null])]);
        DB::purge($name); return DB::connection($name);
    }
    private function principal(\PDO $pdo,string $database,string $privileges): array
    {
        $user='p104_'.bin2hex(random_bytes(6)); $password=bin2hex(random_bytes(24));
        $account=$pdo->quote($user)."@'127.0.0.1'";
        $pdo->exec('CREATE USER '.$account.' IDENTIFIED BY '.$pdo->quote($password));
        $pdo->exec('GRANT '.$privileges.' ON `'.$database.'`.* TO '.$account);
        return [$user,$password];
    }
    private function attributes(\PDO $pdo): string
    {
        $rows=$pdo->query('SELECT * FROM users ORDER BY id')->fetchAll();
        foreach($rows as &$row) unset($row['super_admin_slot']);
        return hash('sha256',json_encode($rows));
    }

    public function test_mysql_only_variant_refuses_the_actual_mariadb_server(): void
    {
        $pdo=Phase104Database::connect(DB::connection()->getDatabaseName()); $before=$this->attributes($pdo);
        try { (require database_path('approval-required/2026_10_31_120000_protect_sole_super_admin.php'))->up(); $this->fail('Wrong engine variant must be refused.'); }
        catch(\RuntimeException $e) { $this->assertStringContainsString('MySQL 8.x',$e->getMessage()); }
        $this->assertSame($before,$this->attributes($pdo));
    }

    public function test_non_strict_native_session_is_refused_without_changes(): void
    {
        $db=DB::connection(); $mode=$db->selectOne('SELECT @@SESSION.sql_mode AS mode')->mode;
        $this->assertStringContainsString('STRICT_TRANS_TABLES',$mode);
        try {
            $db->statement("SET SESSION sql_mode=''");
            try { $this->migration()->up(); $this->fail('Unsafe native SQL mode must be refused.'); }
            catch(\RuntimeException $e) { $this->assertStringContainsString('SQL mode',$e->getMessage()); }
            $this->assertSame(3,(int)$db->selectOne("SELECT COUNT(*) AS total FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->total);
        } finally { $db->statement('SET SESSION sql_mode='.$db->getPdo()->quote($mode)); }
    }

    public function test_exited_installer_retains_first_guard_and_can_be_completed_without_dropping_it(): void
    {
        $database=Phase104Database::create(); $admin=Phase104Database::connect($database); $before=$this->attributes($admin);
        $p=new Process([PHP_BINARY,base_path('tests/Support/phase104-interrupt-worker.php')],base_path(),['DB_DATABASE'=>$database]); $p->setTimeout(30); $p->run();
        $this->assertSame(77,$p->getExitCode(),'Installer must exit between committed DDL steps.');
        $this->assertStringContainsString('FIRST_GUARD_INSTALLED',$p->getOutput(),'Installer must reach the first committed guard.');
        $guards=$admin->query("SELECT TRIGGER_NAME,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->fetchAll();
        $this->assertCount(1,$guards); $this->assertSame('agribantay_users_super_admin_bi',$guards[0]['TRIGGER_NAME']);
        $this->assertSame(0,(int)$admin->query('SELECT COUNT(*) FROM migrations')->fetchColumn());
        $this->connection('interrupted_fixture',$database);
        try { DB::usingConnection('interrupted_fixture',fn()=>$this->migration()->up()); $this->fail('Interrupted installation must not be blindly retried.'); }
        catch(\RuntimeException $e) { $this->assertStringContainsString('Existing or partial',$e->getMessage()); }
        preg_match_all("/<<<'SQL'\R(.*?)\RSQL\)/s",file_get_contents(database_path('approval-required/2026_10_31_130000_protect_sole_super_admin_mariadb.php')),$sql);
        $body=explode("FOR EACH ROW\n",str_replace("\r",'',$sql[1][0]),2)[1];
        $this->assertSame(preg_replace('/\s+/',' ',trim($body)),preg_replace('/\s+/',' ',trim($guards[0]['ACTION_STATEMENT'])));
        // Deliberate test-only repair of verified missing steps. No DROP.
        foreach(array_slice($sql[1],1) as $remaining) $admin->exec($remaining);
        $this->assertSame($before,$this->attributes($admin));
        $this->assertSame(3,(int)$admin->query("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->fetchColumn());
        $this->assertSame(1,(int)$admin->query("SELECT COUNT(*) FROM users WHERE super_admin_slot=1 AND status='active'")->fetchColumn());
        $admin->exec("INSERT INTO migrations (migration,batch) VALUES ('2026_10_31_130000_protect_sole_super_admin_mariadb',1)");
        $this->assertSame(1,(int)$admin->query('SELECT COUNT(*) FROM migrations')->fetchColumn());
    }

    public function test_parallel_active_and_inactive_super_admin_creation_is_rejected(): void
    {
        $database=DB::connection()->getDatabaseName(); $pdo=Phase104Database::connect($database); $before=$this->attributes($pdo);
        $c=Phase104Database::settings(); $barrier=$c['directory'].'/accounts-'.bin2hex(random_bytes(8)); $workers=[];
        try {
            foreach(['active','inactive','active','inactive'] as $status) {
                $p=new Process([PHP_BINARY,base_path('tests/Support/phase104-account-worker.php'),$database,$barrier,$status],base_path()); $p->setTimeout(30); $p->start(); $workers[]=$p;
            }
            $deadline=microtime(true)+20;
            while(!collect($workers)->every(fn($p)=>str_contains($p->getOutput(),'READY')) && microtime(true)<$deadline) usleep(10000);
            $this->assertTrue(collect($workers)->every(fn($p)=>str_contains($p->getOutput(),'READY')));
            file_put_contents($barrier,'synthetic');
            foreach($workers as $p) { $p->wait(); $this->assertTrue($p->isSuccessful(),'Native worker failed.'); $this->assertStringContainsString('"sqlstate":"45000"',$p->getOutput()); $this->assertStringContainsString('"errno":1644',$p->getOutput()); }
        } finally { foreach($workers as $p) if($p->isRunning()) $p->stop(); }
        $this->assertSame($before,$this->attributes($pdo)); $this->assertSame(1,(int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='super_admin'")->fetchColumn());
    }

    public function test_dml_only_user_obeys_definer_guards_and_cannot_run_ddl(): void
    {
        $database=Phase104Database::create(); $admin=Phase104Database::connect($database);
        $this->connection('dml_fixture',$database); DB::usingConnection('dml_fixture',fn()=>$this->migration()->up());
        [$user,$password]=$this->principal($admin,$database,'SELECT,INSERT,UPDATE,DELETE');
        $pdo=Phase104Database::connect($database,$user,$password);
        $before=$this->attributes($pdo);
        foreach(["DELETE FROM users WHERE role='super_admin'","UPDATE users SET status='inactive' WHERE role='super_admin'","UPDATE users SET role='super_admin' WHERE role='admin'"] as $sql) {
            try { $pdo->exec($sql); $this->fail('DML guard must reject.'); } catch(\PDOException $e) { $this->assertSame('45000',$e->errorInfo[0]); }
            $this->assertSame($before,$this->attributes($pdo));
        }
        $pdo->exec("UPDATE users SET first_name='Authorized profile' WHERE role='super_admin'");
        $this->assertSame('Authorized profile',$pdo->query("SELECT first_name FROM users WHERE role='super_admin'")->fetchColumn());
        foreach(['ALTER TABLE users ADD COLUMN forbidden INT','DROP TRIGGER agribantay_users_super_admin_bd','TRUNCATE TABLE users'] as $sql) {
            try { $pdo->exec($sql); $this->fail('DML runtime cannot change DDL.'); } catch(\PDOException $e) { $this->assertSame(1142,(int)$e->errorInfo[1]); }
        }
        $triggers=$admin->query("SELECT DEFINER FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->fetchAll();
        $this->assertCount(3,$triggers);
        foreach($triggers as $t) $this->assertSame(Phase104Database::settings()['username'].'@127.0.0.1',$t['DEFINER']);
        $this->assertSame(1,(int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='super_admin' AND status='active'")->fetchColumn());
    }

    public function test_partial_ddl_denial_retains_guards_and_reviewed_completion_preserves_accounts(): void
    {
        $database=Phase104Database::create(); $admin=Phase104Database::connect($database); $before=$this->attributes($admin);
        [$user,$password]=$this->principal($admin,$database,'SELECT,TRIGGER');
        $this->connection('limited_installer',$database,$user,$password);
        try { DB::usingConnection('limited_installer',fn()=>$this->migration()->up()); $this->fail('Missing ALTER privilege must fail.'); }
        catch(QueryException $e) { $this->assertSame(1142,(int)$e->errorInfo[1]); }
        $this->assertSame(3,(int)$admin->query("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->fetchColumn());
        $this->assertSame(0,(int)$admin->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='super_admin_slot'")->fetchColumn());
        $this->assertSame(0,(int)$admin->query('SELECT COUNT(*) FROM migrations')->fetchColumn());
        $this->assertSame($before,$this->attributes($admin));
        $this->connection('repair_fixture',$database);
        try { DB::usingConnection('repair_fixture',fn()=>$this->migration()->up()); $this->fail('Blind retry must be refused.'); }
        catch(\RuntimeException $e) { $this->assertStringContainsString('Existing or partial',$e->getMessage()); }
        preg_match_all("/<<<'SQL'\R(.*?)\RSQL\)/s",file_get_contents(database_path('approval-required/2026_10_31_130000_protect_sole_super_admin_mariadb.php')),$sql);
        $actual=$admin->query("SELECT TRIGGER_NAME,ACTION_STATEMENT,DEFINER FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->fetchAll();
        foreach(array_slice($sql[1],0,3) as $expected) {
            preg_match('/CREATE TRIGGER (\w+)/',$expected,$name); $row=collect($actual)->firstWhere('TRIGGER_NAME',$name[1]);
            $body=explode("FOR EACH ROW\n",str_replace("\r",'',$expected),2)[1];
            $this->assertSame(preg_replace('/\s+/',' ',trim($body)),preg_replace('/\s+/',' ',trim($row['ACTION_STATEMENT'])));
            $this->assertSame($user.'@127.0.0.1',$row['DEFINER']);
        }
        // Explicit test-only completion after verifying every retained trigger.
        // This is not an automatic production recovery path and drops nothing.
        $admin->exec($sql[1][3]);
        $this->assertSame($before,$this->attributes($admin));
        $admin->exec("INSERT INTO migrations (migration,batch) VALUES ('2026_10_31_130000_protect_sole_super_admin_mariadb',1)");
        $this->artisan('migrate',['--database'=>'repair_fixture','--path'=>['database/approval-required/2026_10_31_130000_protect_sole_super_admin_mariadb.php'],'--force'=>true])->assertSuccessful();
        $this->assertSame(1,(int)$admin->query('SELECT COUNT(*) FROM migrations')->fetchColumn());
        try { $admin->exec("DELETE FROM users WHERE role='super_admin'"); $this->fail('Retained definer guard must still work.'); }
        catch(\PDOException $e) { $this->assertSame('45000',$e->errorInfo[0]); }
        $this->assertSame(1,(int)$admin->query("SELECT COUNT(*) FROM users WHERE super_admin_slot=1 AND status='active'")->fetchColumn());
    }
}
