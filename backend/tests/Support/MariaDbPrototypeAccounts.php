<?php

namespace Tests\Support;

use PDO;
use RuntimeException;

/** New, random identities on the positively identified private test server only. */
final class MariaDbPrototypeAccounts
{
    private array $owned = [];

    public function create(): array
    {
        if (getenv('POULTRY_HOUSE_MARIADB_PROTOTYPE') !== '1') {
            throw new RuntimeException('Fixture account opt-in required.');
        }
        $pdo = Phase104Database::connect();
        $name = 'p8_'.bin2hex(random_bytes(6));
        $password = bin2hex(random_bytes(24));
        $pdo->exec('CREATE USER '.$pdo->quote($name)."@'127.0.0.1' IDENTIFIED BY ".$pdo->quote($password));
        $this->owned[$name] = true;

        return ['username' => $name, 'password' => $password];
    }

    public function installer(string $database, string $user): void
    {
        $this->grant($database, $user, '*', 'SELECT,INSERT,CREATE,ALTER,INDEX,REFERENCES,TRIGGER');
    }

    public function definerOnly(string $database, string $user): void
    {
        $pdo = $this->guard($database, $user);
        $pdo->exec('REVOKE ALL PRIVILEGES ON `'.$database.'`.* FROM '.$pdo->quote($user)."@'127.0.0.1'");
        foreach (['poultry_houses', 'sensors'] as $table) {
            $this->grant($database, $user, $table, 'SELECT,TRIGGER');
        }
    }

    public function runtime(string $database, string $user): void
    {
        foreach (['users', 'farms', 'sensors', 'sensor_readings', 'alert_history', 'activity_logs', 'poultry_houses'] as $table) {
            $this->grant($database, $user, $table, 'SELECT,INSERT,UPDATE,DELETE');
        }
        foreach (['device_assignment_events', 'poultry_house_initializations'] as $table) {
            $this->grant($database, $user, $table, 'SELECT,INSERT');
        }
        foreach (['migrations', 'phase8_fixture_ownership'] as $table) {
            $this->grant($database, $user, $table, 'SELECT');
        }
    }

    private function grant(string $database, string $user, string $table, string $privileges): void
    {
        $pdo = $this->guard($database, $user);
        if ($table !== '*' && ! preg_match('/\A[a-z_0-9]+\z/D', $table)) {
            throw new RuntimeException('Invalid fixture table.');
        }
        $pdo->exec('GRANT '.$privileges.' ON `'.$database.'`.'.($table === '*' ? '*' : '`'.$table.'`').' TO '.$pdo->quote($user)."@'127.0.0.1'");
    }

    private function guard(string $database, string $user): PDO
    {
        if (! isset($this->owned[$user]) || ! preg_match('/\Aagribantay_house_phase8_[a-f0-9]{12}\z/D', $database)) {
            throw new RuntimeException('Only owned disposable accounts/schema grants are allowed.');
        }

        return Phase104Database::connect();
    }

    public function drop(string $user): void
    {
        if (! isset($this->owned[$user])) {
            throw new RuntimeException('Only an account created by this instance may be removed.');
        }
        $pdo = Phase104Database::connect();
        $pdo->exec('DROP USER '.$pdo->quote($user)."@'127.0.0.1'");
        unset($this->owned[$user]);
    }

    public function cleanup(): void
    {
        foreach (array_keys($this->owned) as $user) {
            $this->drop($user);
        }
    }
}
