<?php

namespace Tests\Support;

use PDO;
use RuntimeException;

/** Native MariaDB test infrastructure. Never accepts operational connections. */
class Phase104Database
{
    public static function settings(): array
    {
        $path = getenv('PHASE104_CONFIG') ?: '';
        $directory = realpath(dirname($path));
        $temporary = realpath(sys_get_temp_dir());
        if (! $directory || ! $temporary || ! str_starts_with(strtolower(str_replace('\\', '/', $directory)), strtolower(str_replace('\\', '/', $temporary)).'/agribantay-phase104-mariadb-')) {
            throw new RuntimeException('Private Phase 10.4 runtime configuration required.');
        }
        $c = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (($c['host'] ?? '') !== '127.0.0.1' || (int) ($c['port'] ?? 0) !== 3307
            || realpath($c['directory'] ?? '') !== $directory
            || realpath($c['datadir'] ?? '') !== realpath($directory.'/data')) {
            throw new RuntimeException('Unexpected Phase 10.4 connection or data directory.');
        }
        return $c;
    }

    public static function connect(?string $database = null, ?string $user = null, ?string $password = null): PDO
    {
        $c = self::settings();
        if ($database !== null && ! preg_match('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', $database)) {
            throw new RuntimeException('Disposable schema namespace required.');
        }
        $pdo = new PDO('mysql:host=127.0.0.1;port=3307'.($database ? ';dbname='.$database : ''), $user ?? $c['username'], $password ?? $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $identity = $pdo->query('SELECT VERSION() AS version,@@port AS port,@@datadir AS datadir,@@bind_address AS bind_address')->fetch();
        if (! preg_match('/\A(?:5\.5\.5-)?11\.8\.9-MariaDB(?:[-+].*)?\z/i', $identity['version'])
            || (int) $identity['port'] !== 3307 || $identity['bind_address'] !== '127.0.0.1'
            || realpath($identity['datadir']) !== realpath($c['datadir'])) {
            throw new RuntimeException('Server identity does not match the isolated MariaDB 11.8.9 runtime.');
        }
        return $pdo;
    }

    public static function create(): string
    {
        $c = self::settings();
        $pdo = self::connect();
        $manifest = json_decode(file_get_contents($c['directory'].'/schema.json'), true, 512, JSON_THROW_ON_ERROR);
        $name = 'agribantay_phase4_test_'.bin2hex(random_bytes(6));
        $pdo->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $pdo->exec('USE `'.$name.'`');
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        foreach ($manifest as $table => $sql) {
            if (! preg_match('/\A[a-z_]+\z/', $table) || ! str_starts_with($sql, 'CREATE TABLE `'.$table.'`')) throw new RuntimeException('Unexpected fixture schema.');
            $pdo->exec($sql);
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        $insert = $pdo->prepare('INSERT INTO users (first_name,last_name,mobile_number,email,password,role,status,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,NOW(),NOW())');
        foreach (['super_admin','admin','vet','farm_owner'] as $i => $role) {
            $insert->execute(['Synthetic','Fixture '.$role,'0900000000'.($i+1),'fixture-'.$i.'@example.test',password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT),$role,'active']);
        }
        $pdo->exec("INSERT INTO farms (user_id,farm_name,owner_name,mobile_number,barangay,address,farm_size,status,created_at,updated_at) VALUES (4,'Synthetic fixture farm','Synthetic Owner','09000000004','Calansayan','Synthetic address','Small','Active',NOW(),NOW())");
        self::seedArchive($pdo);
        return $name;
    }

    public static function seedArchive(PDO $pdo): void
    {
        if((int)$pdo->query('SELECT COUNT(*) FROM generated_reports')->fetchColumn()!==0) throw new RuntimeException('Archive fixture already populated; no overwrite.');
        $pdo->exec("INSERT INTO generated_reports (report_name,period_start,period_end,report_type,generated_by_id,snapshot,created_at,updated_at) SELECT 'Synthetic native archive','2026-10-01','2026-10-31','Monthly',id,'{}','2026-10-15 20:00:00','2026-10-15 20:00:00' FROM users WHERE role='super_admin'");
    }
}
