<?php

namespace AgriBantay\MariaDbPrototype;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/** Experimental MariaDB 11.8.9 fixture guard. No operational installation mode. */
final class MariaDbPoultryHouseSchema
{
    public static function requireBaseline(): void
    {
        $name = DB::connection()->getDatabaseName();
        if (getenv('POULTRY_HOUSE_MARIADB_PROTOTYPE') !== '1'
            || ! preg_match('/\Aagribantay_house_phase8_[a-f0-9]{12}\z/D', $name)
            || ! in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            throw new RuntimeException('STOP: disposable MariaDB prototype fixture required.');
        }
        $identity = DB::selectOne('SELECT DATABASE() AS selected_database,VERSION() AS version,@@port AS port,@@bind_address AS bind_address,@@datadir AS datadir,
            @@foreign_key_checks AS fk_checks,@@check_constraint_checks AS check_checks,@@SESSION.sql_mode AS modes');
        $temporary = strtolower(str_replace('\\', '/', realpath(sys_get_temp_dir()))).'/agribantay-phase104-mariadb-';
        if ($identity->selected_database !== $name || ! preg_match('/\A(?:5\.5\.5-)?11\.8\.9-MariaDB(?:[-+].*)?\z/i', $identity->version)
            || (int) $identity->port !== 3307 || $identity->bind_address !== '127.0.0.1'
            || ! str_starts_with(strtolower(str_replace('\\', '/', realpath($identity->datadir) ?: '')), $temporary)
            || (int) $identity->fk_checks !== 1 || (int) $identity->check_checks !== 1
            || ! str_contains($identity->modes, 'STRICT_TRANS_TABLES') || str_contains($identity->modes, 'ORACLE')) {
            throw new RuntimeException('STOP: engine, private runtime or enforcement mismatch.');
        }
        $token = getenv('PHASE8_FIXTURE_TOKEN') ?: '';
        $owner = DB::table('phase8_fixture_ownership')->pluck('token_sha256')->all();
        if (! preg_match('/\A[a-f0-9]{64}\z/D', $token) || $owner !== [hash('sha256', $token)]) {
            throw new RuntimeException('STOP: fixture ownership mismatch.');
        }
        foreach (['users', 'farms', 'sensors', 'sensor_readings', 'alert_history', 'device_assignment_events'] as $table) {
            $metadata = DB::selectOne('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [$table]);
            $id = DB::selectOne('SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [$table, 'id']);
            if (! $metadata || $metadata->ENGINE !== 'InnoDB' || ! $id
                || ! preg_match('/\Abigint(?:\(20\))? unsigned\z/D', $id->COLUMN_TYPE)
                || $id->IS_NULLABLE !== 'NO' || $id->COLUMN_KEY !== 'PRI' || ! str_contains($id->EXTRA, 'auto_increment')) {
                throw new RuntimeException('STOP: incompatible '.$table.' baseline.');
            }
        }
        $mysql = ['2026_11_01_000000_create_poultry_house_inventory_foundation', '2026_11_01_000100_add_house_context_to_device_assignment_events',
            '2026_11_01_000200_add_house_assignment_to_sensors', '2026_11_01_000300_add_house_provenance_to_monitoring_history'];
        if (DB::table('migrations')->whereIn('migration', $mysql)->exists()) {
            throw new RuntimeException('STOP: mixed engine migration history is not permitted.');
        }
    }

    public static function absentColumns(string $table, array $columns): void
    {
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                throw new RuntimeException('STOP: existing '.$table.'.'.$column.' requires partial-installation review.');
            }
        }
    }

    public static function forwardOnly(): never
    {
        throw new RuntimeException('MariaDB house provenance is forward-only; use approved forward repair.');
    }
}
