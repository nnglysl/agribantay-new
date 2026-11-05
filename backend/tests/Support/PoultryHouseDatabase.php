<?php

namespace Tests\Support;

use Dotenv\Dotenv;
use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;

/** Native fixtures: read schema only from the identified local DB; write only random private schemas. */
final class PoultryHouseDatabase
{
    private static array $owned = [];

    private static ?array $definitions = null;

    public static function credentials(): array
    {
        $root = dirname(__DIR__, 2);
        $env = Dotenv::createArrayBacked($root)->load();
        if (($env['APP_ENV'] ?? '') !== 'local' || ($env['DB_CONNECTION'] ?? '') !== 'mysql'
            || ! in_array($env['DB_HOST'] ?? '', ['127.0.0.1', 'localhost'], true)
            || (string) ($env['DB_PORT'] ?? '') !== '3306'
            || ($env['DB_DATABASE'] ?? '') !== 'db_agribantay'
            || ! empty($env['DB_URL']) || ! empty($env['DB_SOCKET'])
            || is_file($root.'/bootstrap/cache/config.php')) {
            throw new RuntimeException('STOP: the reviewed local development mapping could not be positively identified.');
        }

        return ['username' => $env['DB_USERNAME'], 'password' => $env['DB_PASSWORD'] ?? ''];
    }

    public static function server(): PDO
    {
        $credentials = self::credentials();
        $pdo = new PDO('mysql:host=127.0.0.1;port=3306;charset=utf8mb4', $credentials['username'], $credentials['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $identity = $pdo->query('SELECT VERSION() AS version, @@datadir AS datadir, @@port AS port')->fetch();
        if ($identity['version'] !== '8.0.46' || (int) $identity['port'] !== 3306
            || strtolower(str_replace('\\', '/', $identity['datadir'])) !== 'c:/programdata/mysql/mysql server 8.0/data/') {
            throw new RuntimeException('STOP: local MySQL server identity differs from the verified baseline.');
        }

        return $pdo;
    }

    public static function fixtureConnection(string $name): array
    {
        if (! preg_match('/\Aagribantay_house_phase2_[a-f0-9]{12}\z/D', $name)) {
            throw new RuntimeException('Refusing a non-fixture database target.');
        }

        return ['driver' => 'mysql', 'host' => '127.0.0.1', 'port' => 3306, 'database' => $name,
            ...self::credentials(), 'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '', 'strict' => true, 'engine' => 'InnoDB'];
    }

    private static function definitions(PDO $pdo): array
    {
        if (self::$definitions !== null) {
            return self::$definitions;
        }
        $pdo->exec('USE `db_agribantay`');
        $pdo->exec('START TRANSACTION READ ONLY');
        try {
            $definitions = [];
            foreach ($pdo->query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')->fetchAll(PDO::FETCH_NUM) as $row) {
                $name = $row[0];
                if (! preg_match('/\A[a-z_]+\z/D', $name)) {
                    throw new RuntimeException('Unexpected baseline identifier.');
                }
                $definitions[$name] = $pdo->query('SHOW CREATE TABLE `'.$name.'`')->fetch(PDO::FETCH_NUM)[1];
            }
            if (count($definitions) !== 30 || isset($definitions['poultry_houses'])) {
                throw new RuntimeException('STOP: baseline schema changed; review before creating fixtures.');
            }

            return self::$definitions = $definitions;
        } finally {
            $pdo->exec('ROLLBACK');
        }
    }

    public static function create(): string
    {
        $pdo = self::server();
        $definitions = self::definitions($pdo); // Schema only, never operational rows.
        $name = 'agribantay_house_phase2_'.bin2hex(random_bytes(6));
        self::fixtureConnection($name);
        $pdo->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        self::$owned[$name] = true;
        try {
            $pdo->exec('USE `'.$name.'`');
            $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
            foreach ($definitions as $ddl) {
                $pdo->exec(preg_replace('/ AUTO_INCREMENT=\d+/', '', $ddl));
            }
            $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
            config(['database.connections.house_phase2' => self::fixtureConnection($name)]);
            DB::purge('house_phase2');
            DB::setDefaultConnection('house_phase2');

            return $name;
        } catch (\Throwable $error) {
            self::drop($name);
            throw $error;
        }
    }

    public static function migrate(bool $recordHistory = false): void
    {
        $name = DB::connection()->getDatabaseName();
        if (! isset(self::$owned[$name])) {
            throw new RuntimeException('Only a fixture created by this process may be migrated.');
        }
        foreach (glob(dirname(__DIR__, 2).'/database/migrations/2026_11_01_000*.php') as $path) {
            (require $path)->up();
            if ($recordHistory) {
                // New disposable fixtures only; mirror successful completion of
                // these four exact migrations without running other pending files.
                DB::table('migrations')->insert(['migration' => basename($path, '.php'), 'batch' => 1]);
            }
        }
    }

    public static function drop(string $name): void
    {
        self::fixtureConnection($name);
        if (! isset(self::$owned[$name])) {
            throw new RuntimeException('Refusing to drop a database not created by this test process.');
        }
        self::server()->exec('DROP DATABASE `'.$name.'`');
        unset(self::$owned[$name]);
    }

    /** Read-only digest; returns no business values, credentials, or personal records. */
    public static function operationalFingerprint(): array
    {
        $pdo = self::server();
        $pdo->exec('USE `db_agribantay`');
        $pdo->exec('START TRANSACTION READ ONLY');
        try {
            $out = [];
            foreach ($pdo->query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')->fetchAll(PDO::FETCH_NUM) as $row) {
                $table = $row[0];
                if (! preg_match('/\A[a-z_]+\z/D', $table)) {
                    throw new RuntimeException('Unexpected baseline identifier.');
                }
                $columns = $pdo->query('SHOW COLUMNS FROM `'.$table.'`')->fetchAll();
                $parts = [];
                foreach ($columns as $column) {
                    $quoted = '`'.str_replace('`', '``', $column['Field']).'`';
                    $parts[] = "CASE WHEN $quoted IS NULL THEN 'N' ELSE CONCAT('V',HEX($quoted)) END";
                }
                $query = $pdo->query('SELECT SHA2(CONCAT_WS(\'|\','.implode(',', $parts).'),256) AS digest FROM `'.$table.'` ORDER BY digest');
                $hash = hash_init('sha256');
                $count = 0;
                while ($digest = $query->fetchColumn()) {
                    hash_update($hash, $digest."\n");
                    $count++;
                }
                $out[$table] = ['count' => $count, 'rows_sha256' => hash_final($hash),
                    'schema_sha256' => hash('sha256', $pdo->query('SHOW CREATE TABLE `'.$table.'`')->fetch(PDO::FETCH_NUM)[1])];
            }

            return $out;
        } finally {
            $pdo->exec('ROLLBACK');
        }
    }
}
