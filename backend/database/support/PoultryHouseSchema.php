<?php

namespace Database\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/** Preconditions only: no operational data repair, population, or attribution. */
final class PoultryHouseSchema
{
    public static function requireBaseline(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            throw new RuntimeException('Poultry house foundation requires the rehearsed native MySQL engine.');
        }
        $version = DB::selectOne('SELECT VERSION() AS version')->version;
        if (stripos($version, 'MariaDB') !== false || ! preg_match('/^8\./', $version)
            || version_compare($version, '8.0.16', '<')) {
            throw new RuntimeException('Rehearse this foundation on the target engine first; MySQL 8 with enforced CHECK constraints is required.');
        }
        foreach (['users', 'farms', 'sensors', 'sensor_readings', 'alert_history', 'device_assignment_events'] as $table) {
            $metadata = DB::selectOne('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [$table]);
            $id = DB::selectOne('SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [$table, 'id']);
            if (! $metadata || $metadata->ENGINE !== 'InnoDB' || ! $id
                || $id->COLUMN_TYPE !== 'bigint unsigned' || $id->IS_NULLABLE !== 'NO'
                || $id->COLUMN_KEY !== 'PRI' || ! str_contains($id->EXTRA, 'auto_increment')) {
                throw new RuntimeException('Unexpected '.$table.' baseline; stop rather than repair or guess.');
            }
        }
    }

    public static function absentColumns(string $table, array $columns): void
    {
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                throw new RuntimeException('Unexpected existing '.$table.'.'.$column.'; inspect partial installation before retrying.');
            }
        }
    }

    public static function forwardOnly(): never
    {
        throw new RuntimeException('Poultry house provenance is forward-only. Use reviewed forward repair; do not drop retained history.');
    }
}
