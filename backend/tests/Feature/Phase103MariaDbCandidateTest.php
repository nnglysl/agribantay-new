<?php

namespace Tests\Feature;

use Illuminate\Database\Connection;
use Illuminate\Database\DatabaseManager;
use Illuminate\Database\MySqlConnection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** PHP plan/grammar checks, not a MariaDB server or SQL parser. */
class Phase103MariaDbCandidateTest extends TestCase
{
    private function migration()
    {
        return require database_path('approval-required/2026_10_31_130000_protect_sole_super_admin_mariadb.php');
    }

    private function plan(array $state, array &$ddl, int $failAt = 0): void
    {
        $s = array_replace(['version' => '11.8.9-MariaDB', 'driver' => 'mysql', 'pretending' => false, 'transaction' => 0,
            'mode' => 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION', 'engine' => 'InnoDB', 'id_type' => 'bigint(20) unsigned',
            'id_data_type' => 'bigint', 'id_key' => 'PRI', 'id_extra' => 'auto_increment', 'role_nullable' => 'NO',
            'role_type' => "enum('super_admin','admin','vet','farm_owner')", 'parents' => 0, 'supers' => 1, 'active' => 1, 'triggers' => 0, 'index' => 0, 'slot' => false], $state);
        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('pretending')->andReturn($s['pretending']);
        $connection->shouldReceive('getDriverName')->andReturn($s['driver']);
        $connection->shouldReceive('transactionLevel')->andReturn($s['transaction']);
        $connection->shouldReceive('selectOne')->andReturnUsing(function ($sql) use ($s) {
            if (str_contains($sql, 'VERSION()')) {
                return (object) ['version' => $s['version']];
            }
            if (str_contains($sql, '@@SESSION.sql_mode')) {
                return (object) ['mode' => $s['mode']];
            }
            if (str_contains($sql, 'information_schema.TABLES')) {
                return (object) ['engine' => $s['engine']];
            }
            if (str_contains($sql, 'KEY_COLUMN_USAGE')) {
                return (object) ['total' => $s['parents']];
            }
            if (str_contains($sql, 'TRIGGERS')) {
                return (object) ['total' => $s['triggers']];
            }
            if (str_contains($sql, 'STATISTICS')) {
                return (object) ['total' => $s['index']];
            }

            return (object) ['total' => $s['supers'], 'active' => $s['active']];
        });
        $columns = [(object) ['name' => 'id', 'type' => $s['id_type'], 'data_type' => $s['id_data_type'], 'nullable' => 'NO', 'column_key' => $s['id_key'], 'extra' => $s['id_extra']],
            (object) ['name' => 'role', 'type' => $s['role_type'], 'nullable' => $s['role_nullable']],
            (object) ['name' => 'status', 'type' => "enum('active','inactive')", 'nullable' => 'NO']];
        if ($s['slot']) {
            $columns[] = (object) ['name' => 'super_admin_slot'];
        }
        $connection->shouldReceive('select')->andReturn($columns);
        $record = function ($sql) use (&$ddl, $failAt) {
            $ddl[] = $sql;
            if ($failAt && count($ddl) === $failAt) {
                throw new \RuntimeException('Simulated DDL failure');
            }

            return true;
        };
        $connection->shouldReceive('unprepared')->andReturnUsing($record);
        $connection->shouldReceive('statement')->andReturnUsing($record);
        DB::swap(Mockery::mock(DatabaseManager::class));
        DB::shouldReceive('connection')->with(null)->andReturn($connection);
    }

    public static function acceptedMetadata(): array
    {
        $cases = [];
        foreach (['11.8.9-MariaDB', '11.8.9-MariaDB-log', '5.5.5-11.8.9-MariaDB-ubu2404'] as $version) {
            foreach (['bigint unsigned', 'bigint(20) unsigned'] as $type) {
                $cases[] = [$version, $type];
            }
        }

        return $cases;
    }

    #[DataProvider('acceptedMetadata')]
    public function test_modeled_metadata_produces_only_the_reviewed_ddl(string $version, string $type): void
    {
        $ddl = [];
        $this->plan(['version' => $version, 'id_type' => $type], $ddl);
        $this->migration()->up();
        $this->assertCount(4, $ddl);
        $this->assertStringContainsString('END) PERSISTENT', $ddl[3]);
        $this->assertStringContainsString('ADD UNIQUE INDEX users_super_admin_singleton_unique', $ddl[3]);
        preg_match_all("/<<<'SQL'\R(.*?)\RSQL\)/s", file_get_contents(database_path('approval-required/2026_10_31_120000_protect_sole_super_admin.php')), $old);
        foreach (array_slice($ddl, 0, 3) as $i => $sql) {
            $this->assertSame(str_replace("\r", '', trim($old[1][$i])), str_replace("\r", '', trim($sql)), 'Protective trigger bodies must retain the reviewed policy.');
        }
    }

    public static function rejectedMetadata(): array
    {
        $cases = [];
        foreach (['8.0.46', '10.4.32-MariaDB', '11.8.8-MariaDB', '11.8.90-MariaDB', '11.8.9-MySQL', '12.0.1-MariaDB'] as $version) {
            $cases[] = [['version' => $version], 'MariaDB 11.8.9'];
        }
        foreach ([
            [['driver' => 'sqlite'], 'mysql driver'], [['pretending' => true], 'real metadata'], [['transaction' => 1], 'transactions'],
            [['mode' => 'NO_ENGINE_SUBSTITUTION'], 'SQL mode'], [['mode' => 'STRICT_TRANS_TABLES,ORACLE'], 'SQL mode'],
            [['engine' => 'MyISAM'], 'InnoDB'], [['id_type' => 'bigint(20)'], 'schema'], [['id_data_type' => 'int'], 'schema'],
            [['id_key' => ''], 'schema'], [['id_extra' => ''], 'schema'], [['role_nullable' => 'YES'], 'schema'],
            [['role_type' => "enum('admin','vet','farm_owner')"], 'schema'], [['parents' => 1], 'parent foreign-key'],
            [['supers' => 0, 'active' => 0], 'Exactly one'], [['supers' => 2, 'active' => 2], 'Exactly one'], [['active' => 0], 'Exactly one'],
            [['slot' => true], 'Existing or partial'], [['triggers' => 1], 'Existing or partial'], [['index' => 1], 'Existing or partial'],
        ] as $case) {
            $cases[] = $case;
        }

        return $cases;
    }

    #[DataProvider('rejectedMetadata')]
    public function test_modeled_unsafe_preconditions_emit_no_ddl(array $state, string $message): void
    {
        $ddl = [];
        $this->plan($state, $ddl);
        try {
            $this->migration()->up();
            $this->fail('Unsafe metadata must fail closed.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString($message, $e->getMessage());
        }
        $this->assertSame([], $ddl);
    }

    public function test_modeled_partial_failure_never_removes_installed_guards(): void
    {
        for ($stage = 1; $stage <= 4; $stage++) {
            $ddl = [];
            $this->plan([], $ddl, $stage);
            try {
                $this->migration()->up();
                $this->fail('Injected failure must propagate.');
            } catch (\RuntimeException $e) {
                $this->assertSame('Simulated DDL failure', $e->getMessage());
            }
            $this->assertCount($stage, $ddl);
            foreach ($ddl as $i => $sql) {
                $this->assertStringStartsWith($i < 3 ? 'CREATE TRIGGER agribantay_users_' : 'ALTER TABLE users', $sql);
            }
        }
    }

    public function test_candidate_down_refuses_removal(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('separately approved');
        $this->migration()->down();
    }

    public function test_document_migration_compiles_with_mariadb_grammar_context_without_a_server(): void
    {
        $connection = new class(fn () => throw new \RuntimeException('Plan check cannot open a server connection'), 'synthetic', '', ['charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'engine' => 'InnoDB']) extends MySqlConnection
        {
            public function isMaria()
            {
                return true;
            }

            public function getServerVersion(): string
            {
                return '11.8.9';
            }
        };
        $connection->useDefaultSchemaGrammar();
        $sql = [];
        Schema::shouldReceive('create')->once()->andReturnUsing(function ($table, $callback) use ($connection, &$sql) {
            $this->assertSame('farm_control_documents', $table);
            $sql = (new Blueprint($connection, $table, $callback))->toSql();
        });
        (require database_path('migrations/2026_10_31_000000_create_farm_control_documents_table.php'))->up();
        $combined = strtolower(implode("\n", $sql));
        foreach (['bigint unsigned', 'varchar(511)', 'on delete restrict', 'on delete set null', 'unique', 'file_path', 'farm_id', 'category'] as $fragment) {
            $this->assertStringContainsString($fragment, $combined);
        }
        $this->assertStringNotContainsString('ammonia_adc_mv', $combined);
        $this->assertStringNotContainsString('drop table', $combined);
    }

    public function test_actual_mysql_is_rejected_without_schema_or_record_changes(): void
    {
        if (getenv('PHASE103_MYSQL_NEGATIVE') !== '1') {
            $this->markTestSkipped('Explicit private native MySQL fixture required.');
        }
        $db = DB::connection();
        $this->assertSame('mysql', $db->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', $db->getDatabaseName());
        $this->assertContains($db->getConfig('host'), ['localhost', '127.0.0.1', '::1']);
        $this->assertFalse((bool) $db->getConfig('url'));
        $this->assertStringStartsWith('8.', $db->selectOne('SELECT VERSION() AS version')->version);
        $digest = fn () => hash('sha256', json_encode([$db->table('users')->orderBy('id')->get()->all(), $db->getSchemaBuilder()->getColumnListing('users'), $db->table('migrations')->orderBy('id')->get()->all(), $db->select('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME')]));
        $before = $digest();
        try {
            $this->migration()->up();
            $this->fail('Actual MySQL cannot run the MariaDB candidate.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('MariaDB 11.8.9', $e->getMessage());
        }
        $this->assertSame($before, $digest());
    }
}
