<?php

namespace AgriBantay\MariaDbPrototype;

use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

require_once __DIR__.'/MariaDbPoultryHouseSchema.php';

/** Proposed engine-specific contract, used ONLY by isolated prototype tests. */
final class FoundationReadiness
{
    public static function names(): array
    {
        return [
            '2026_11_02_000000_create_poultry_house_inventory_foundation_mariadb',
            '2026_11_02_000100_add_house_context_to_device_assignment_events_mariadb',
            '2026_11_02_000200_add_house_assignment_to_sensors_mariadb',
            '2026_11_02_000300_add_house_provenance_to_monitoring_history_mariadb',
        ];
    }

    public static function inspect(): array
    {
        try {
            MariaDbPoultryHouseSchema::requireBaseline();
            self::verifySources();
            foreach (self::names() as $name) {
                if (DB::table('migrations')->where('migration', $name)->count() !== 1) {
                    throw new RuntimeException('completion_history');
                }
            }
            $manifest = require dirname(__DIR__, 3).'/scripts/poultry-house-preparation/manifest.php';
            foreach ($manifest['columns'] as $table => $columns) {
                foreach ($columns as $column) {
                    if (! DB::connection()->getSchemaBuilder()->hasColumn($table, $column)) {
                        throw new RuntimeException('missing_column');
                    }
                }
            }
            foreach ($manifest['indexes'] as $name => [$table, $columns, $unique]) {
                $rows = DB::select('SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX', [$table, $name]);
                if (implode(',', array_column($rows, 'COLUMN_NAME')) !== $columns
                    || array_unique(array_column($rows, 'NON_UNIQUE')) !== [$unique ? 0 : 1]) {
                    throw new RuntimeException('index_definition');
                }
            }
            foreach ($manifest['foreign_keys'] as $name => [$table, $columns, $parent, $references]) {
                $rows = DB::select('SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? ORDER BY ORDINAL_POSITION', [$table, $name]);
                $rules = DB::selectOne('SELECT UPDATE_RULE,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=?', [$name]);
                if (implode(',', array_column($rows, 'COLUMN_NAME')) !== $columns
                    || array_unique(array_column($rows, 'REFERENCED_TABLE_NAME')) !== [$parent]
                    || implode(',', array_column($rows, 'REFERENCED_COLUMN_NAME')) !== $references
                    || ! $rules || $rules->UPDATE_RULE !== 'RESTRICT' || $rules->DELETE_RULE !== 'RESTRICT') {
                    throw new RuntimeException('foreign_key_definition');
                }
            }
            $checks = [
                'ph_number_positive' => 'house_number > 0',
                'phi_registration_count' => "source <> 'registration' or initial_house_count > 0",
                'sensors_house_context_ck' => 'poultry_house_id is null and current_assignment_event_id is null or poultry_house_id is not null and current_assignment_event_id is not null',
                'sr_house_context_ck' => 'poultry_house_id is null and assignment_event_id is null or poultry_house_id is not null and assignment_event_id is not null',
                'ah_house_context_ck' => 'poultry_house_id is null and assignment_event_id is null or poultry_house_id is not null and assignment_event_id is not null',
                'measurement_context' => 'json_valid(measurement_context)',
            ];
            foreach ($checks as $name => $expected) {
                $row = DB::selectOne('SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=?', [$name]);
                if (! $row || self::canonical($row->CHECK_CLAUSE) !== self::canonical($expected)) {
                    throw new RuntimeException('check_definition');
                }
            }
            foreach ($manifest['triggers'] as $name => [$table, $event, $unit, $marker]) {
                $source = file_get_contents(__DIR__.'/'.self::names()[$unit - 1].'.php');
                $start = strpos($source, $marker);
                if ($start === false || ! preg_match('/BEGIN.*?END"\);/s', substr($source, $start), $body)) {
                    throw new RuntimeException('trigger_source');
                }
                $row = DB::selectOne('SELECT EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?', [$name]);
                if (! $row || $row->EVENT_OBJECT_TABLE !== $table || $row->EVENT_MANIPULATION !== $event || $row->ACTION_TIMING !== 'BEFORE'
                    || self::canonical($row->ACTION_STATEMENT) !== self::canonical(substr($body[0], 0, -3))) {
                    throw new RuntimeException('trigger_definition');
                }
            }
            $slot = DB::selectOne("SELECT EXTRA,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sensors' AND COLUMN_NAME='active_house_slot'");
            if (! $slot || $slot->EXTRA !== 'STORED GENERATED'
                || self::canonical($slot->GENERATION_EXPRESSION) !== self::canonical("case when status = 'Active' then poultry_house_id else NULL end")) {
                throw new RuntimeException('generated_slot');
            }

            return ['ready' => true, 'engine_contract' => 'mariadb-11.8.9-prototype', 'production_approved' => false];
        } catch (Throwable $error) {
            return ['ready' => false, 'reason' => $error instanceof RuntimeException ? $error->getMessage() : 'metadata_or_permission_error'];
        }
    }

    public static function verifySources(): void
    {
        foreach (require __DIR__.'/source-hashes.php' as $relative => $sha) {
            if (! hash_equals($sha, hash_file('sha256', __DIR__.'/'.$relative))) {
                throw new RuntimeException('source_hash');
            }
        }
    }

    private static function canonical(string $value): string
    {
        // Parentheses remain significant. MariaDB metadata rendering is pinned to 11.8.9.
        return strtolower(preg_replace('/[\s`]+/', '', $value));
    }
}
