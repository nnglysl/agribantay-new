<?php

namespace Tests\Support;

use App\Services\PoultryHouseFoundationReadiness;
use Illuminate\Database\Migrations\DatabaseMigrationRepository;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;
use Throwable;

/** Application fixtures only; never selects or clones the operational schema. */
final class Phase9FoundationDatabase
{
    private static array $owned = [];

    private static array $users = [];

    private static ?MariaDbPoultryHouseFixture $maria = null;

    public static function enabled(): bool
    {
        return in_array(getenv('PHASE9_APPLICATION_ENGINE'), ['mysql', 'mariadb'], true);
    }

    private static function server(string $engine): PDO
    {
        return $engine === 'mysql' ? PoultryHouseDatabase::server() : Phase104Database::connect();
    }

    public static function create(bool $install = true): string
    {
        $engine = getenv('PHASE9_APPLICATION_ENGINE');
        if (! self::enabled() || getenv('POULTRY_HOUSE_PHASE9_APPLICATION_TEST') !== '1') {
            throw new RuntimeException('Explicit Phase 9 native fixture opt-in required.');
        }
        $settings = Phase104Database::settings();
        if (hash_file('sha256', $settings['directory'].'/schema.json') !== 'c1a32cc02f1ae7348c073c81cb9dc552b0e89e8daad8c634164345b29c6024d6') {
            throw new RuntimeException('Archived schema manifest mismatch.');
        }
        $definitions = json_decode(file_get_contents($settings['directory'].'/schema.json'), true, 512, JSON_THROW_ON_ERROR);
        $server = self::server($engine);
        if ($engine === 'mariadb') {
            self::$maria ??= new MariaDbPoultryHouseFixture;
            $fixture = self::$maria->create();
            $name = $fixture['database'];
            $token = $fixture['token'];
        } else {
            $name = 'agribantay_house_phase9_'.bin2hex(random_bytes(6));
            $token = bin2hex(random_bytes(32));
            $server->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        }
        self::$owned[$name] = ['engine' => $engine, 'token' => $token, 'installer' => null, 'runtime' => null];
        try {
            $server->exec('USE `'.$name.'`');
            if ($engine === 'mysql') {
                foreach ($definitions as $sql) {
                    $server->exec($sql);
                }
                $server->exec('CREATE TABLE phase8_fixture_ownership(token_sha256 CHAR(64) NOT NULL) ENGINE=InnoDB');
                $server->prepare('INSERT INTO phase8_fixture_ownership VALUES(?)')->execute([hash('sha256', $token)]);
            } else {
                // Remove only this harness's synthetic seed rows, in dependency order.
                foreach (array_reverse(array_keys($definitions)) as $table) {
                    if ($table === 'migrations') {
                        continue;
                    }
                    $server->exec('DELETE FROM `'.$table.'`');
                    $server->exec('ALTER TABLE `'.$table.'` AUTO_INCREMENT=1');
                }
            }
            foreach ([
                'cache' => '`key` VARCHAR(255) PRIMARY KEY,value MEDIUMTEXT NOT NULL,expiration INT NOT NULL',
                'cache_locks' => '`key` VARCHAR(255) PRIMARY KEY,owner VARCHAR(255) NOT NULL,expiration INT NOT NULL',
                'sessions' => 'id VARCHAR(255) PRIMARY KEY,user_id BIGINT UNSIGNED NULL,ip_address VARCHAR(45) NULL,user_agent TEXT NULL,payload LONGTEXT NOT NULL,last_activity INT NOT NULL',
                'jobs' => 'id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,queue VARCHAR(255) NOT NULL,payload LONGTEXT NOT NULL,attempts TINYINT UNSIGNED NOT NULL,reserved_at INT UNSIGNED NULL,available_at INT UNSIGNED NOT NULL,created_at INT UNSIGNED NOT NULL',
                'job_batches' => 'id VARCHAR(255) PRIMARY KEY,name VARCHAR(255) NOT NULL,total_jobs INT NOT NULL,pending_jobs INT NOT NULL,failed_jobs INT NOT NULL,failed_job_ids LONGTEXT NOT NULL,options MEDIUMTEXT NULL,cancelled_at INT NULL,created_at INT NOT NULL,finished_at INT NULL',
                'failed_jobs' => 'id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,uuid VARCHAR(255) UNIQUE NOT NULL,connection TEXT NOT NULL,queue TEXT NOT NULL,payload LONGTEXT NOT NULL,exception LONGTEXT NOT NULL,failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
                'password_reset_tokens' => 'email VARCHAR(255) PRIMARY KEY,token VARCHAR(255) NOT NULL,created_at TIMESTAMP NULL',
            ] as $table => $ddl) {
                $server->exec('CREATE TABLE `'.$table.'`('.$ddl.') ENGINE=InnoDB');
            }
            if ($engine === 'mariadb') {
                $installer = self::newUser($name);
                $server->exec('GRANT SELECT,INSERT,CREATE,ALTER,INDEX,REFERENCES,TRIGGER,CREATE ROUTINE ON `'.$name.'`.* TO '.$server->quote($installer['username'])."@'127.0.0.1'");
                self::$owned[$name]['installer'] = $installer;
            }
            self::bind($name, true);
            $manager = app('db');
            $migrator = new Migrator(new DatabaseMigrationRepository($manager, 'migrations'), $manager, app('files'));
            // Exact baseline prerequisite, not a pending-directory migration.
            $migrator->run([base_path('database/migrations/2026_10_31_000000_create_farm_control_documents_table.php')]);
            if ($install) {
                $names = array_keys($engine === 'mysql' ? PoultryHouseFoundationReadiness::MYSQL : PoultryHouseFoundationReadiness::MARIADB);
                $directory = $engine === 'mysql' ? 'migrations' : 'compatibility/poultry-house-mariadb';
                foreach ($names as $migration) {
                    $migrator->run([base_path('database/'.$directory.'/'.$migration.'.php')], ['step' => true]);
                }
                if ($engine === 'mariadb') {
                    DB::unprepared(PoultryHouseFoundationReadiness::auditProcedureSql($engine));
                }
            }
            if ($engine === 'mariadb') {
                $user = self::newUser($name);
                self::$owned[$name]['runtime'] = $user;
                foreach (DB::select('SHOW TABLES') as $row) {
                    $table = array_values((array) $row)[0];
                    $privileges = in_array($table, ['migrations', 'phase8_fixture_ownership'], true) ? 'SELECT'
                        : (in_array($table, ['device_assignment_events', 'poultry_house_initializations', 'activity_logs'], true) ? 'SELECT,INSERT' : 'SELECT,INSERT,UPDATE,DELETE');
                    $server->exec('GRANT '.$privileges.' ON `'.$name.'`.`'.$table.'` TO '.$server->quote($user['username'])."@'127.0.0.1'");
                }
                if ($install) {
                    $server->exec('GRANT EXECUTE ON PROCEDURE `'.$name.'`.'.PoultryHouseFoundationReadiness::AUDIT_PROCEDURE.' TO '.$server->quote($user['username'])."@'127.0.0.1'");
                }
                $installer = self::$owned[$name]['installer'];
                $server->exec('REVOKE ALL PRIVILEGES ON `'.$name.'`.* FROM '.$server->quote($installer['username'])."@'127.0.0.1'");
                $server->exec('GRANT SELECT ON `'.$name.'`.* TO '.$server->quote($installer['username'])."@'127.0.0.1'");
                foreach (['poultry_houses', 'sensors'] as $table) {
                    if ($install || $table === 'sensors') {
                        $server->exec('GRANT SELECT,TRIGGER ON `'.$name.'`.`'.$table.'` TO '.$server->quote($installer['username'])."@'127.0.0.1'");
                    }
                }
            }
            self::bind($name);
            if ($install) {
                $ready = app(PoultryHouseFoundationReadiness::class)->inspect();
                if (! $ready['ready']) {
                    throw new RuntimeException('Phase 9 fixture readiness refused: '.json_encode($ready));
                }
            }

            return $name;
        } catch (Throwable $error) {
            self::drop($name);
            throw $error;
        }
    }

    private static function newUser(string $name): array
    {
        $pdo = self::server('mariadb');
        $user = 'p9_'.bin2hex(random_bytes(6));
        $password = bin2hex(random_bytes(24));
        $pdo->exec('CREATE USER '.$pdo->quote($user)."@'127.0.0.1' IDENTIFIED BY ".$pdo->quote($password));
        self::$users[$user] = $name;

        return ['username' => $user, 'password' => $password];
    }

    public static function configuration(string $name, bool $installer = false): array
    {
        if (! isset(self::$owned[$name])) {
            throw new RuntimeException('Only owned Phase 9 fixtures are allowed.');
        }
        $fixture = self::$owned[$name];
        $credential = $fixture['engine'] === 'mysql' ? PoultryHouseDatabase::credentials()
            : ($fixture[$installer ? 'installer' : 'runtime'] ?? Phase104Database::settings());

        return ['driver' => 'mysql', 'host' => '127.0.0.1', 'port' => $fixture['engine'] === 'mysql' ? 3306 : 3307,
            'database' => $name, 'username' => $credential['username'], 'password' => $credential['password'],
            'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'prefix' => '', 'strict' => true];
    }

    public static function bind(string $name, bool $installer = false): void
    {
        config(['database.connections.house_phase2' => self::configuration($name, $installer)]);
        DB::purge('house_phase2');
        DB::setDefaultConnection('house_phase2');
        putenv('PHASE8_FIXTURE_TOKEN='.self::$owned[$name]['token']);
    }

    public static function workerInput(string $name): array
    {
        return ['connection' => self::configuration($name), 'token' => self::$owned[$name]['token']];
    }

    public static function privileged(string $name): PDO
    {
        if (! isset(self::$owned[$name])) {
            throw new RuntimeException('Owned fixture required.');
        }
        $pdo = self::server(self::$owned[$name]['engine']);
        $pdo->exec('USE `'.$name.'`');

        return $pdo;
    }

    public static function removeOwnedDefiner(string $name, string $definer): void
    {
        $installer = self::$owned[$name]['installer'] ?? null;
        if (! $installer || $definer !== $installer['username'].'@127.0.0.1' || (self::$users[$installer['username']] ?? '') !== $name) {
            throw new RuntimeException('Only this fixture\'s maintenance test identity may be removed.');
        }
        $pdo = self::server('mariadb');
        $pdo->exec('DROP USER '.$pdo->quote($installer['username'])."@'127.0.0.1'");
        unset(self::$users[$installer['username']]);
    }

    public static function drop(string $name): void
    {
        if (! isset(self::$owned[$name])) {
            throw new RuntimeException('Only this process\'s owned fixtures may be removed.');
        }
        DB::purge('house_phase2');
        $engine = self::$owned[$name]['engine'];
        $pdo = self::server($engine);
        if ($engine === 'mariadb') {
            self::$maria->drop($name);
            foreach (self::$users as $user => $fixture) {
                if ($fixture === $name) {
                    $pdo->exec('DROP USER '.$pdo->quote($user)."@'127.0.0.1'");
                    unset(self::$users[$user]);
                }
            }
        } else {
            $pdo->exec('DROP DATABASE `'.$name.'`');
        }
        unset(self::$owned[$name]);
    }
}
