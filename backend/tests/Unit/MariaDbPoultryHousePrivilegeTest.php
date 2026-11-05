<?php

namespace Tests\Unit;

use AgriBantay\MariaDbPrototype\FoundationReadiness;
use Illuminate\Support\Facades\Facade;
use PDOException;
use PHPUnit\Framework\TestCase;
use Tests\Support\MariaDbHouseOperations as Operations;
use Tests\Support\MariaDbPoultryHouseFixture as Fixture;
use Tests\Support\MariaDbPrototypeAccounts;
use Tests\Support\Phase104Database;

require_once dirname(__DIR__, 2).'/database/compatibility/poultry-house-mariadb/FoundationReadiness.php';

final class MariaDbPoultryHousePrivilegeTest extends TestCase
{
    private Fixture $harness;

    private array $target;

    private MariaDbPrototypeAccounts $accounts;

    protected function setUp(): void
    {
        if (getenv('POULTRY_HOUSE_MARIADB_PROTOTYPE') !== '1') {
            $this->markTestSkipped('Explicit isolated MariaDB opt-in required.');
        }
        $this->harness = new Fixture;
        $this->target = $this->harness->create();
        $this->accounts = new MariaDbPrototypeAccounts;
    }

    protected function tearDown(): void
    {
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication(null);
        if (isset($this->target)) {
            $this->harness->drop($this->target['database']);
        }
        if (isset($this->accounts)) {
            $this->accounts->cleanup();
        }
        parent::tearDown();
    }

    private function install(): array
    {
        $installer = $this->accounts->create();
        $this->accounts->installer($this->target['database'], $installer['username']);
        $pdo = Fixture::connect($this->target['database'], ...array_values($installer));
        Fixture::migrate(Fixture::capsule($pdo, $this->target['database'], $this->target['token']));
        $this->assertTrue(FoundationReadiness::inspect()['ready'], json_encode(FoundationReadiness::inspect()));
        $this->assertSame(4, (int) $pdo->query('SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND DEFINER=CURRENT_USER()')->fetchColumn());

        return [$installer, $pdo];
    }

    public function test_schema_scoped_installer_and_reduced_definer_support_restricted_runtime(): void
    {
        [$installer, $pdo] = $this->install();
        $pdo->exec("INSERT INTO poultry_houses(farm_id,house_number,status) VALUES(1,1,'Active'),(1,2,'Active')");
        $this->accounts->definerOnly($this->target['database'], $installer['username']);
        $runtime = $this->accounts->create();
        $this->accounts->runtime($this->target['database'], $runtime['username']);
        $app = Fixture::connect($this->target['database'], ...array_values($runtime));
        $app->beginTransaction();
        Operations::assign($app, 1, 1, 1);
        Operations::ingest($app, 1);
        $app->commit();
        try {
            $app->exec("UPDATE poultry_houses SET status='Inactive' WHERE id=1");
            $this->fail('Reduced definer must still enforce association blocker.');
        } catch (PDOException $e) {
            $this->assertSame(1644, (int) $e->errorInfo[1]);
        }
        $app->beginTransaction();
        Operations::assign($app, 1, null, null);
        $app->commit();
        $app->exec("UPDATE poultry_houses SET status='Inactive' WHERE id=1");
        $this->assertSame('Inactive', $app->query('SELECT status FROM poultry_houses WHERE id=1')->fetchColumn());
        foreach (['CREATE TABLE forbidden(id INT)', 'DROP TRIGGER ph_identity_immutable_bu',
            'UPDATE device_assignment_events SET to_farm_id=NULL WHERE id=1', 'DELETE FROM poultry_house_initializations'] as $sql) {
            try {
                $app->exec($sql);
                $this->fail('Runtime authority must reject '.$sql);
            } catch (PDOException $e) {
                $this->assertSame('42000', $e->errorInfo[0]);
            }
        }
        // Metadata visibility is separate from DML authority: no TRIGGER privilege.
        Fixture::capsule($app, $this->target['database'], $this->target['token']);
        $this->assertFalse(FoundationReadiness::inspect()['ready'], 'Missing trigger visibility must fail closed, never be interpreted as certified installation.');
    }

    public function test_missing_trigger_privilege_stops_without_fabricating_completion(): void
    {
        $installer = $this->accounts->create();
        $this->accounts->installer($this->target['database'], $installer['username']);
        $admin = Phase104Database::connect();
        $admin->exec('REVOKE TRIGGER ON `'.$this->target['database'].'`.* FROM '.$admin->quote($installer['username'])."@'127.0.0.1'");
        $pdo = Fixture::connect($this->target['database'], ...array_values($installer));
        try {
            Fixture::migrate(Fixture::capsule($pdo, $this->target['database'], $this->target['token']));
            $this->fail('Installation without TRIGGER must fail.');
        } catch (\Throwable $e) {
            $this->assertStringContainsString('TRIGGER', $e->getMessage());
        }
        $this->assertSame(2, (int) $pdo->query('SELECT COUNT(*) FROM migrations')->fetchColumn());
        $this->assertFalse(FoundationReadiness::inspect()['ready']);
    }

    public function test_lost_definer_breaks_guarded_writes_without_removing_triggers(): void
    {
        [$installer, $pdo] = $this->install();
        $pdo->exec("INSERT INTO poultry_houses(farm_id,house_number,status) VALUES(1,1,'Active')");
        $this->accounts->drop($installer['username']);
        $admin = Fixture::connect($this->target['database']);
        try {
            $admin->exec("UPDATE poultry_houses SET status='Inactive' WHERE id=1");
            $this->fail('A missing definer must not silently bypass the triggers.');
        } catch (PDOException $e) {
            $this->assertSame(1449, (int) $e->errorInfo[1]);
        }
        $this->assertSame(4, (int) $admin->query('SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()')->fetchColumn());
    }
}
