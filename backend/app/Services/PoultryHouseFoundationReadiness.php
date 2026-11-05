<?php

namespace App\Services;

use App\Support\PoultryHouseFoundationException;
use Illuminate\Support\Facades\DB;
use Throwable;

/** Read-only runtime checks. Successful readiness is not maintenance/deployment approval. */
final class PoultryHouseFoundationReadiness
{
    public const AUDIT_PROCEDURE = 'agribantay_house_safeguards_v1';

    public const MYSQL = [
        '2026_11_01_000000_create_poultry_house_inventory_foundation' => '376a648b4fafd6b29216a12fd676ac33226387ea1613854b5008cc9da1e33567',
        '2026_11_01_000100_add_house_context_to_device_assignment_events' => '40e9964b98d09939dc94e668ebf232c7daa4c52caeb0d63bf2808016cde5c97f',
        '2026_11_01_000200_add_house_assignment_to_sensors' => 'a18f5094887ce7a6a48785aab8a24fa75ff09e0fa52ebedd42c013f8e87883a8',
        '2026_11_01_000300_add_house_provenance_to_monitoring_history' => '1a601bd0f1761f24b61ee62be7e74d39d4c5bdc52c5631f36f1f6a74b5422ccf',
    ];

    public const MARIADB = [
        '2026_11_02_000000_create_poultry_house_inventory_foundation_mariadb' => 'ed01859075edcb68ed01407b9edbe0e28daf7794b9d1b458608144e6a35bbde0',
        '2026_11_02_000100_add_house_context_to_device_assignment_events_mariadb' => '24a8a421845c65b677a687aab5b2c2fee905f12f7b10922ba4bcf2075ee0b8d8',
        '2026_11_02_000200_add_house_assignment_to_sensors_mariadb' => '77da0850186b6bb5cd764ec288f3af9c48b270a32b8adf8d4444252f68bf8ce8',
        '2026_11_02_000300_add_house_provenance_to_monitoring_history_mariadb' => '580984bf9d6974420ec1280727717ffea19a52c91772ac8b1af5ff3bea2411a5',
    ];

    public static function engine(string $version): ?string
    {
        if (stripos($version, 'MariaDB') !== false) {
            return preg_match('/\A(?:5\.5\.5-)?11\.8\.9-MariaDB(?:[-+].*)?\z/i', $version) ? 'mariadb' : null;
        }

        return preg_match('/\A8\./', $version) && version_compare($version, '8.0.16', '>=') ? 'mysql' : null;
    }

    public static function manifest(): array
    {
        return require dirname(__DIR__).'/Support/poultry-house-foundation.php';
    }

    public static function validHistory(string $engine, array $rows): bool
    {
        if (! in_array($engine, ['mysql', 'mariadb'], true)) {
            return false;
        }
        $selected = array_keys($engine === 'mysql' ? self::MYSQL : self::MARIADB);
        $other = array_keys($engine === 'mysql' ? self::MARIADB : self::MYSQL);

        return ! array_intersect($rows, $other) && count($rows) === 4 && ! array_diff($selected, $rows) && count(array_unique($rows)) === 4;
    }

    public static function canonical(string $sql): string
    {
        return strtolower(preg_replace('/[\s`]+|_utf8mb4/', '', str_replace("\\'", "'", $sql)));
    }

    /** Reads trusted release sources only; never requires/discovers/executes a migration. */
    public static function triggerContract(string $engine): array
    {
        $sources = [];
        foreach ($engine === 'mysql' ? self::MYSQL : self::MARIADB as $name => $hash) {
            $path = dirname(__DIR__, 2).'/database/'.($engine === 'mysql' ? 'migrations/' : 'compatibility/poultry-house-mariadb/').$name.'.php';
            if (! is_file($path) || ! hash_equals($hash, hash_file('sha256', $path))) {
                throw new PoultryHouseFoundationException('release_source_mismatch');
            }
            $sources[] = file_get_contents($path);
        }
        $out = [];
        foreach (self::manifest()['triggers'] as $name => [$table, $event, $unit, $marker]) {
            $start = strpos($sources[$unit - 1], $marker);
            if ($start === false || ! preg_match('/BEGIN.*?END"\);/s', substr($sources[$unit - 1], $start), $body)) {
                throw new PoultryHouseFoundationException('trigger_source_mismatch');
            }
            $out[$name] = [$table, $event, hash('sha256', self::canonical(substr($body[0], 0, -3)))];
        }

        return $out;
    }

    public function inspect(): array
    {
        try {
            $db = DB::connection();
            $select = static fn (string $sql, array $bindings = []) => $db->select($sql, $bindings, false);
            $one = static fn (string $sql, array $bindings = []) => $db->selectOne($sql, $bindings, false);
            if (! in_array($db->getDriverName(), ['mysql', 'mariadb'], true)) {
                throw new PoultryHouseFoundationException('unsupported_driver');
            }
            $server = $one('SELECT VERSION() AS version,@@SESSION.sql_mode AS modes,@@foreign_key_checks AS fk_checks');
            $engine = self::engine($server->version);
            if (! $engine || ! str_contains($server->modes, 'STRICT_TRANS_TABLES') || str_contains($server->modes, 'ORACLE') || (int) $server->fk_checks !== 1) {
                throw new PoultryHouseFoundationException('unsupported_engine_or_enforcement');
            }
            if ($engine === 'mariadb' && (int) $one('SELECT @@check_constraint_checks AS enabled')->enabled !== 1) {
                throw new PoultryHouseFoundationException('checks_disabled');
            }
            $selected = array_keys($engine === 'mysql' ? self::MYSQL : self::MARIADB);
            $other = array_keys($engine === 'mysql' ? self::MARIADB : self::MYSQL);
            $rows = $db->table('migrations')->whereIn('migration', [...$selected, ...$other])->useWritePdo()->pluck('migration')->all();
            if (! self::validHistory($engine, $rows)) {
                throw new PoultryHouseFoundationException('incomplete_or_mixed_history');
            }
            $manifest = self::manifest();
            $tables = $select('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
            $tables = array_column($tables, 'ENGINE', 'TABLE_NAME');
            foreach (['users', 'farms', 'sensors', 'sensor_readings', 'alert_history', 'device_assignment_events', 'poultry_houses', 'poultry_house_initializations'] as $table) {
                if (($tables[$table] ?? '') !== 'InnoDB') {
                    throw new PoultryHouseFoundationException('table_engine');
                }
            }
            $columns = [];
            foreach ($select('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()') as $row) {
                $columns[$row->TABLE_NAME][$row->COLUMN_NAME] = $row;
            }
            foreach ($manifest['columns'] + [
                'poultry_houses' => ['id', 'farm_id', 'house_number', 'status', 'creation_request_id', 'deactivated_at', 'reactivated_at', 'created_at', 'updated_at'],
                'poultry_house_initializations' => ['id', 'farm_id', 'operation_id', 'source', 'initial_house_count', 'verification_reference', 'manifest_sha256', 'verified_by', 'verifier_role', 'completed_at'],
            ] as $table => $names) {
                foreach ($names as $name) {
                    if (! isset($columns[$table][$name])) {
                        throw new PoultryHouseFoundationException('missing_column');
                    }
                }
            }
            foreach ($manifest['columns'] as $table => $names) {
                foreach ($names as $name) {
                    $column = $columns[$table][$name];
                    if (str_ends_with($name, '_id') || str_ends_with($name, '_number') || $name === 'active_house_slot') {
                        if (! preg_match('/\Abigint(?:\(20\))? unsigned\z/D', $column->COLUMN_TYPE)) {
                            throw new PoultryHouseFoundationException('column_type');
                        }
                    }
                    if ($name !== 'last_house_number' && $column->IS_NULLABLE !== 'YES') {
                        throw new PoultryHouseFoundationException('legacy_nullability');
                    }
                }
            }
            $counter = $columns['farms']['last_house_number'];
            if ($counter->IS_NULLABLE !== 'NO' || trim((string) $counter->COLUMN_DEFAULT, "'") !== '0') {
                throw new PoultryHouseFoundationException('allocation_default');
            }
            $indexes = [];
            foreach ($select('SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX') as $row) {
                $indexes[$row->TABLE_NAME][$row->INDEX_NAME][] = $row;
            }
            foreach ($manifest['indexes'] as $name => [$table, $names, $unique]) {
                $index = $indexes[$table][$name] ?? [];
                if (implode(',', array_column($index, 'COLUMN_NAME')) !== $names || array_unique(array_column($index, 'NON_UNIQUE')) !== [$unique ? 0 : 1]) {
                    throw new PoultryHouseFoundationException('index_definition');
                }
            }
            foreach (['users', 'farms', 'sensors', 'sensor_readings', 'alert_history', 'device_assignment_events', 'poultry_houses', 'poultry_house_initializations'] as $table) {
                $id = $columns[$table]['id'] ?? null;
                if (! $id || ! preg_match('/\Abigint(?:\(20\))? unsigned\z/D', $id->COLUMN_TYPE) || $id->IS_NULLABLE !== 'NO'
                    || ! str_contains($id->EXTRA, 'auto_increment') || array_column($indexes[$table]['PRIMARY'] ?? [], 'COLUMN_NAME') !== ['id']) {
                    throw new PoultryHouseFoundationException('primary_identity');
                }
            }
            $keys = [];
            foreach ($select('SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY CONSTRAINT_NAME,ORDINAL_POSITION') as $row) {
                $keys[$row->CONSTRAINT_NAME][] = $row;
            }
            $rules = [];
            foreach ($select('SELECT CONSTRAINT_NAME,UPDATE_RULE,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()') as $row) {
                $rules[$row->CONSTRAINT_NAME] = $row;
            }
            foreach ($manifest['foreign_keys'] as $name => [$table, $names, $parent, $references]) {
                $key = $keys[$name] ?? [];
                if (array_unique(array_column($key, 'TABLE_NAME')) !== [$table] || implode(',', array_column($key, 'COLUMN_NAME')) !== $names || array_unique(array_column($key, 'REFERENCED_TABLE_NAME')) !== [$parent]
                    || implode(',', array_column($key, 'REFERENCED_COLUMN_NAME')) !== $references
                    || ($rules[$name]->DELETE_RULE ?? '') !== 'RESTRICT' || ($rules[$name]->UPDATE_RULE ?? '') !== 'RESTRICT') {
                    throw new PoultryHouseFoundationException('foreign_key_definition');
                }
            }
            $checks = [];
            foreach ($select('SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()') as $row) {
                $checks[$row->CONSTRAINT_NAME] = $row->CHECK_CLAUSE;
            }
            $allChecksVisible = ! array_diff(array_keys(self::checksFor($engine)), array_keys($checks));
            foreach (self::checksFor($engine) as $name => $expected) {
                if (isset($checks[$name]) && self::canonical($checks[$name]) !== self::canonical($expected)) {
                    throw new PoultryHouseFoundationException('check_definition_'.$name);
                }
            }
            if ($engine === 'mysql' && $allChecksVisible && count($select("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK' AND ENFORCED='YES' AND CONSTRAINT_NAME IN ('ph_number_positive','phi_registration_count','sensors_house_context_ck','sr_house_context_ck','ah_house_context_ck')")) !== 5) {
                throw new PoultryHouseFoundationException('checks_not_enforced');
            }
            $slot = $columns['sensors']['active_house_slot'];
            $expected = $engine === 'mysql' ? "(case when (status='Active') then poultry_house_id else NULL end)" : "case when status='Active' then poultry_house_id else NULL end";
            if ($slot->EXTRA !== 'STORED GENERATED' || self::canonical($slot->GENERATION_EXPRESSION) !== self::canonical($expected)) {
                throw new PoultryHouseFoundationException('generated_slot');
            }
            $contract = self::triggerContract($engine);
            if ($engine === 'mysql') {
                $triggers = $select('SELECT TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()');
                $triggers = array_column($triggers, null, 'TRIGGER_NAME');
                $visible = count(array_intersect_key($triggers, $contract));
                if ($visible > 0 && $allChecksVisible) {
                    foreach ($contract as $name => [$table, $event, $hash]) {
                        $trigger = $triggers[$name] ?? null;
                        if (! $trigger || $trigger->EVENT_OBJECT_TABLE !== $table || $trigger->EVENT_MANIPULATION !== $event || $trigger->ACTION_TIMING !== 'BEFORE'
                            || hash('sha256', self::canonical($trigger->ACTION_STATEMENT)) !== $hash) {
                            throw new PoultryHouseFoundationException('trigger_definition');
                        }
                    }

                    return ['ready' => true, 'engine' => $engine, 'maintenance_certified' => false];
                }
            }
            // MariaDB always uses the scoped audit. A restricted MySQL runtime may use it too.
            $routine = $one('SELECT SECURITY_TYPE,SQL_DATA_ACCESS FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME=? AND ROUTINE_TYPE=?', [self::AUDIT_PROCEDURE, 'PROCEDURE']);
            if (! $routine || $routine->SECURITY_TYPE !== 'DEFINER' || $routine->SQL_DATA_ACCESS !== 'READS SQL DATA') {
                throw new PoultryHouseFoundationException('safeguard_audit_contract');
            }
            $statement = $db->getPdo()->query('CALL '.self::AUDIT_PROCEDURE.'()');
            $audit = $statement->fetch(\PDO::FETCH_ASSOC);
            while ($statement->nextRowset()) {
            }
            $statement->closeCursor();
            if (! $audit || (int) $audit['safeguards_ok'] !== 1 || $audit['contract_id'] !== self::contractId($engine)) {
                throw new PoultryHouseFoundationException('safeguard_audit');
            }

            return ['ready' => true, 'engine' => $engine, 'maintenance_certified' => false];
        } catch (Throwable $error) {
            return ['ready' => false, 'reason' => $error instanceof PoultryHouseFoundationException ? $error->getMessage() : 'metadata_or_audit_unavailable', 'maintenance_certified' => false];
        }
    }

    public static function contractId(string $engine): string
    {
        return hash('sha256', json_encode([self::triggerContract($engine), self::checksFor($engine)], JSON_THROW_ON_ERROR));
    }

    private static function checksFor(string $engine): array
    {
        $out = [];
        foreach (self::manifest()['checks'] as $name => [$expression]) {
            $out[$name] = $engine === 'mysql' ? $expression : str_replace(['(', ')'], '', $expression);
        }
        if ($engine === 'mariadb') {
            $out['measurement_context'] = 'json_valid(measurement_context)';
        }

        return $out;
    }

    /** Preparation SQL only. No application path executes this DDL. No caller arguments/DML. */
    public static function auditProcedureSql(string $engine): string
    {
        $predicates = [];
        foreach (self::triggerContract($engine) as $name => [$table, $event, $hash]) {
            $predicates[] = "(TRIGGER_NAME='$name' AND EVENT_OBJECT_TABLE='$table' AND EVENT_MANIPULATION='$event' AND ACTION_TIMING='BEFORE'
                AND SHA2(LOWER(REGEXP_REPLACE(REPLACE(ACTION_STATEMENT,'`',''),'[[:space:]]+','')),256)='$hash' AND DEFINER=CURRENT_USER())";
        }
        $checks = [];
        foreach (self::checksFor($engine) as $name => $expression) {
            $hash = hash('sha256', self::canonical($expression));
            $checks[] = "(CONSTRAINT_NAME='$name' AND SHA2(LOWER(REGEXP_REPLACE(REPLACE(REPLACE(REPLACE(CHECK_CLAUSE,'`',''),'_utf8mb4',''),CHAR(92),''),'[[:space:]]+','')),256)='$hash')";
        }
        $checkCount = count($checks);
        $checkSql = implode(' OR ', $checks);
        $id = self::contractId($engine);

        return 'CREATE PROCEDURE '.self::AUDIT_PROCEDURE."() SQL SECURITY DEFINER READS SQL DATA
            BEGIN
                SELECT (COUNT(*)=4 AND (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS
                    WHERE CONSTRAINT_SCHEMA=DATABASE() AND ($checkSql))=$checkCount) AS safeguards_ok,'$id' AS contract_id
                FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND (".implode(' OR ', $predicates).');
            END';
    }
}
