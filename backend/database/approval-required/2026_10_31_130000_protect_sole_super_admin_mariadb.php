<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// MariaDB 11.8.9 candidate; runtime verification is pending. Never auto-discovered.
// Preserve the separate MySQL-tested file. See PHASE10.3-MARIADB-COMPATIBILITY-REPORT.md.
return new class extends Migration
{
    public function up(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->pretending()) {
            throw new RuntimeException('Safeguard preflight requires real metadata; review the SQL and use isolated staging instead of --pretend.');
        }
        if ($db->getDriverName() !== 'mysql') {
            throw new RuntimeException('This candidate requires MariaDB 11.8.9 through the mysql driver.');
        }
        $version = $db->selectOne('SELECT VERSION() AS version')->version;
        if (! preg_match('/\A(?:5\.5\.5-)?11\.8\.9-MariaDB(?:[-+].*)?\z/i', $version)) {
            throw new RuntimeException('This candidate requires MariaDB 11.8.9 through the mysql driver.');
        }
        $modes = array_map('trim', explode(',', strtoupper($db->selectOne('SELECT @@SESSION.sql_mode AS mode')->mode)));
        if ((! in_array('STRICT_TRANS_TABLES', $modes, true) && ! in_array('STRICT_ALL_TABLES', $modes, true))
            || in_array('ORACLE', $modes, true)) {
            throw new RuntimeException('Review MariaDB SQL mode: strict transactional validation and non-Oracle syntax are required.');
        }
        if ($db->transactionLevel() !== 0) {
            throw new RuntimeException('Run safeguard DDL outside application transactions, with account writers stopped.');
        }
        $engine = $db->selectOne("SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'");
        if (($engine->engine ?? null) !== 'InnoDB') {
            throw new RuntimeException('Super Admin safeguards require an existing InnoDB users table.');
        }
        $columns = collect($db->select("SELECT COLUMN_NAME AS name,COLUMN_TYPE AS type,DATA_TYPE AS data_type,IS_NULLABLE AS nullable,COLUMN_KEY AS column_key,EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'"))->keyBy('name');
        if (($columns['role']->type ?? null) !== "enum('super_admin','admin','vet','farm_owner')"
            || ($columns['status']->type ?? null) !== "enum('active','inactive')"
            || ($columns['role']->nullable ?? null) !== 'NO'
            || ($columns['status']->nullable ?? null) !== 'NO'
            || ($columns['id']->data_type ?? null) !== 'bigint'
            || ! preg_match('/\\Abigint(?:\\([0-9]+\\))? unsigned\\z/i', $columns['id']->type ?? '')
            || ($columns['id']->nullable ?? null) !== 'NO'
            || ($columns['id']->column_key ?? null) !== 'PRI'
            || ! str_contains($columns['id']->extra ?? '', 'auto_increment')) {
            throw new RuntimeException('Unexpected users schema; review compatibility before safeguard DDL.');
        }
        $parents = $db->selectOne("SELECT COUNT(*) AS total FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND REFERENCED_TABLE_NAME IS NOT NULL")->total;
        if ((int) $parents !== 0) {
            throw new RuntimeException('Review users parent foreign-key cascades before installing safeguards.');
        }
        $count = $db->selectOne("SELECT COUNT(*) AS total,SUM(status='active') AS active FROM users WHERE role='super_admin'");
        if ((int) $count->total !== 1 || (int) $count->active !== 1) {
            throw new RuntimeException('Exactly one existing active Super Admin is required; no account is repaired automatically.');
        }
        $triggers = $db->selectOne("SELECT COUNT(*) AS total FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->total;
        $index = $db->selectOne("SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='users_super_admin_singleton_unique'")->total;
        if ($columns->has('super_admin_slot') || (int) $triggers !== 0 || (int) $index !== 0) {
            throw new RuntimeException('Existing or partial users protections require operator review; nothing is removed automatically.');
        }

        // Per-statement atomic DDL does not cover all four installation steps.
        // Retain installed guards on failure; reviewed repair is required.
        $db->unprepared(<<<'SQL'
CREATE TRIGGER agribantay_users_super_admin_bi BEFORE INSERT ON users
FOR EACH ROW
BEGIN
    IF NEW.role = 'super_admin' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Super Admin provisioning is closed; preserve the authorized account.';
    END IF;
END
SQL);
        $db->unprepared(<<<'SQL'
CREATE TRIGGER agribantay_users_super_admin_bu BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    IF OLD.role = 'super_admin' THEN
        IF NOT (NEW.role <=> 'super_admin') OR NOT (NEW.status <=> 'active') OR NOT (NEW.id <=> OLD.id) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The authorized Super Admin identity, role and active status are protected.';
        END IF;
    ELSEIF NEW.role = 'super_admin' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Promotion to Super Admin is not permitted.';
    END IF;
END
SQL);
        $db->unprepared(<<<'SQL'
CREATE TRIGGER agribantay_users_super_admin_bd BEFORE DELETE ON users
FOR EACH ROW
BEGIN
    IF OLD.role = 'super_admin' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The authorized Super Admin cannot be deleted.';
    END IF;
END
SQL);
        $db->statement(<<<'SQL'
ALTER TABLE users
ADD COLUMN super_admin_slot TINYINT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN role = 'super_admin' THEN 1 ELSE NULL END) PERSISTENT,
ADD UNIQUE INDEX users_super_admin_singleton_unique (super_admin_slot)
SQL);
    }

    public function down(): void
    {
        throw new RuntimeException('Removing Super Admin safeguards requires a separately approved migration and recovery plan.');
    }
};
