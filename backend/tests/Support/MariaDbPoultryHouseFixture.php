<?php

namespace Tests\Support;

use AgriBantay\MariaDbPrototype\FoundationReadiness;
use Illuminate\Database\Capsule\Manager;
use Illuminate\Database\Migrations\DatabaseMigrationRepository;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\Facade;
use PDO;
use RuntimeException;

/** Schema-only archived fixture definitions; never contacts the operational database. */
final class MariaDbPoultryHouseFixture
{
    private array $owned = [];

    public function create(): array
    {
        if (getenv('POULTRY_HOUSE_MARIADB_PROTOTYPE') !== '1') {
            throw new RuntimeException('Explicit MariaDB prototype opt-in required.');
        }
        $c = Phase104Database::settings();
        if (hash_file('sha256', $c['directory'].'/schema.json') !== 'c1a32cc02f1ae7348c073c81cb9dc552b0e89e8daad8c634164345b29c6024d6') {
            throw new RuntimeException('Archived synthetic schema definition manifest differs.');
        }
        $pdo = Phase104Database::connect(); // Positively identified private server, no database selected.
        $name = 'agribantay_house_phase8_'.bin2hex(random_bytes(6));
        $token = bin2hex(random_bytes(32));
        $pdo->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $this->owned[$name] = true;
        try {
            $pdo->exec('USE `'.$name.'`');
            $definitions = json_decode(file_get_contents($c['directory'].'/schema.json'), true, 512, JSON_THROW_ON_ERROR);
            foreach ($definitions as $table => $ddl) {
                if (! preg_match('/\A[a-z_]+\z/D', $table) || ! str_starts_with($ddl, 'CREATE TABLE `'.$table.'`')) {
                    throw new RuntimeException('Unexpected archived schema definition.');
                }
                $pdo->exec($ddl); // Dependency-ordered definitions; FK checks stay ON.
            }
            $pdo->exec('CREATE TABLE phase8_fixture_ownership(token_sha256 CHAR(64) NOT NULL) ENGINE=InnoDB');
            $pdo->prepare('INSERT INTO phase8_fixture_ownership VALUES(?)')->execute([hash('sha256', $token)]);
            $insert = $pdo->prepare('INSERT INTO users(first_name,last_name,email,password,role,status) VALUES(?,?,?,?,?,?)');
            foreach (['super_admin', 'admin', 'farm_owner'] as $i => $role) {
                $insert->execute(['Synthetic', $role, 'phase8-'.$i.'@example.test', 'unusable-synthetic-hash', $role, 'active']);
            }
            $pdo->exec("INSERT INTO farms(user_id,farm_name,owner_name,barangay,farm_size,status) VALUES
                (3,'Synthetic farm one','Synthetic Owner','Calansayan','Small','Active'),
                (3,'Synthetic farm two','Synthetic Owner','Calansayan','Small','Active')");
            $pdo->exec("INSERT INTO sensors(farm_id,device_key,label,sensor_code,status) VALUES
                (1,'synthetic-phase8-key-one','Synthetic one','P8-1','Active'),
                (NULL,'synthetic-phase8-key-two','Synthetic two','P8-2','Active'),
                (NULL,'synthetic-phase8-key-three','Synthetic three','P8-3','Inactive')");
            $pdo->exec("INSERT INTO activity_logs(user_id,role,type,action,details,created_at,updated_at) VALUES(2,'admin','Farm','Synthetic historical event','Retain synthetic evidence',NOW(),NOW())");
            $pdo->exec('INSERT INTO device_assignment_events(sensor_id,activity_log_id,from_farm_id,to_farm_id,occurred_at) VALUES(2,1,1,NULL,NOW())');
            $pdo->exec("INSERT INTO sensor_readings(farm_id,sensor_id,ammonia,temperature,humidity,moisture,created_at) VALUES(1,1,1,28,60,40,'2026-10-01 00:00:00')");
            $pdo->exec("INSERT INTO alert_history(farm_id,sensor_id,sensor_type,status,value,triggered_at) VALUES(1,NULL,'ammonia','Warning',12,'2026-10-01 00:00:00')");
            $pdo->exec("INSERT INTO migrations(migration,batch) VALUES('synthetic_duplicate',16),('synthetic_duplicate',17)");
            $pdo->exec("INSERT INTO sms_logs(user_id,farm_id,phone_number,message,type,status) VALUES(3,1,'09000000000','Synthetic historical provider outcome','Synthetic','Sent')");
            $pdo->exec("INSERT INTO generated_reports(report_name,period_start,period_end,report_type,generated_by_id,snapshot) VALUES('Synthetic retained report','2026-10-01','2026-10-31','Monthly',2,'{}')");

            return ['database' => $name, 'token' => $token];
        } catch (\Throwable $e) {
            $this->drop($name);
            throw $e;
        }
    }

    public static function connect(string $name, ?string $user = null, ?string $password = null): PDO
    {
        if (! preg_match('/\Aagribantay_house_phase8_[a-f0-9]{12}\z/D', $name)) {
            throw new RuntimeException('Disposable Phase 8 namespace required.');
        }
        Phase104Database::connect();
        $c = Phase104Database::settings();

        return new PDO('mysql:host=127.0.0.1;port=3307;dbname='.$name.';charset=utf8mb4', $user ?? $c['username'], $password ?? $c['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    }

    public static function capsule(PDO $pdo, string $name, string $token): Manager
    {
        if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== $name || ! preg_match('/\Aagribantay_house_phase8_[a-f0-9]{12}\z/D', $name)) {
            throw new RuntimeException('Wrong fixture connection.');
        }
        putenv('PHASE8_FIXTURE_TOKEN='.$token);
        $capsule = new Manager;
        $capsule->addConnection(['driver' => 'mysql', 'database' => $name, 'prefix' => '', 'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci']);
        $connection = $capsule->getConnection();
        $connection->setPdo($pdo);
        $capsule->getContainer()->instance('db', $capsule->getDatabaseManager());
        $capsule->getContainer()->bind('db.schema', fn () => $connection->getSchemaBuilder());
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication($capsule->getContainer());

        return $capsule;
    }

    public static function paths(): array
    {
        require_once dirname(__DIR__, 2).'/database/compatibility/poultry-house-mariadb/FoundationReadiness.php';

        return array_map(fn ($name) => dirname(__DIR__, 2).'/database/compatibility/poultry-house-mariadb/'.$name.'.php',
            FoundationReadiness::names());
    }

    public static function migrate(Manager $capsule, ?callable $after = null): void
    {
        $manager = $capsule->getDatabaseManager();
        $migrator = new Migrator(new DatabaseMigrationRepository($manager, 'migrations'), $manager, new Filesystem);
        foreach (self::paths() as $i => $path) {
            FoundationReadiness::verifySources();
            $migrator->run([$path], ['step' => true]); // Real Laravel journal, no fabricated names.
            $after?->__invoke($i + 1);
        }
    }

    public static function fingerprint(PDO $pdo): array
    {
        $out = [];
        foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
            if (! preg_match('/\A[a-z_][a-z0-9_]*\z/D', $table)) {
                throw new RuntimeException('Bad fixture identifier.');
            }
            $columns = $pdo->query('SHOW COLUMNS FROM `'.$table.'`')->fetchAll(PDO::FETCH_COLUMN);
            $rows = $pdo->query('SELECT * FROM `'.$table.'`')->fetchAll(PDO::FETCH_NUM);
            $out[$table] = ['columns' => $columns, 'rows' => $rows];
        }

        return $out;
    }

    public function drop(string $name): void
    {
        if (! isset($this->owned[$name])) {
            throw new RuntimeException('Refusing cleanup of a database not owned by this harness.');
        }
        Phase104Database::connect()->exec('DROP DATABASE `'.$name.'`');
        unset($this->owned[$name]);
    }
}
