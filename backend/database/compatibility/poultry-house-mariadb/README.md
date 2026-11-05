# MariaDB Poultry House foundation — Phase 8 prototype

**Not integrated or approved for installation.** These four candidates sit outside Laravel's normal `database/migrations` discovery. They have separate `2026_11_02_*_mariadb` names and never borrow the tested MySQL journal names. Do not copy them into automatic discovery or run both engine variants.

The original four MySQL definitions/helper remain unchanged. The candidate keeps the same tables, column names, nine RESTRICT FKs, five logical CHECKs, generated Active-slot uniqueness, indexes, retained ledger/initialization semantics and four triggers. The sensor triggers use MariaDB `LOCK IN SHARE MODE` in place of MySQL `FOR SHARE`. MariaDB represents JSON as validated LONGTEXT and emits its extra JSON-validity CHECK. Bigint metadata has a display width. The separate helper recognizes these engine differences and requires FK/CHECK enforcement and strict mode.

Execution is hard-limited to the positively identified private MariaDB 11.8.9 runtime on loopback port 3307, a `agribantay_house_phase8_<12 hex>` schema and a matching fixture token. There is no operational target mode or deployment CLI. Tests obtain the runtime credentials from the previously created private temp configuration; they never read the operational `.env` or select the operational MySQL database. A dependency-ordered archived schema-only fixture manifest is hash-pinned. Synthetic records are generated fresh.

`source-hashes.php` pins the four candidate files, helper and prototype readiness verifier. The test harness verifies these before each exact migration and uses installed Laravel Migrator/DatabaseMigrationRepository for genuine journaling. No test helper stamps completion rows. All down paths refuse removal; partial DDL must be inspected, not blindly retried. The whole preparation package still needs an independently reviewed immutable release manifest; the editable hash list is not a trust root.

`FoundationReadiness.php` is a fixture-only proposal. It checks engine/ownership/enforcement, exact-once candidate journal entries, source hashes, columns, named index/FK/CHECK definitions, generated expression and trigger bodies. It returns `production_approved=false` even when its schema contract passes. It requires enough metadata visibility; an ordinary runtime without TRIGGER privilege cannot certify trigger bodies and fails closed. It does not certify backup/restore, privilege lifetime, operational pause, real inventory or hosting readiness.

The current application deliberately still expects MySQL migration names and therefore reports this candidate as not installed. Integrating an engine-specific runtime readiness contract needs separate approval; do not fabricate MySQL history to bypass that gate. Full maintenance verification and ordinary runtime health checks need separate authority; do not grant runtime DDL/TRIGGER rights just to inspect metadata.

When the verified private MariaDB server is already running, use PowerShell from the repository root:

```powershell
# Set this to the existing reviewed private runtime configuration, not app .env.
$env:PHASE104_CONFIG='C:\path\to\reviewed-temp-runtime\private.json'
$env:POULTRY_HOUSE_MARIADB_PROTOTYPE='1'
& C:\xampp\php\php.exe backend/vendor/phpunit/phpunit/phpunit --configuration backend/phpunit.xml backend/tests/Unit/MariaDbPoultryHousePrototypeTest.php backend/tests/Unit/MariaDbPoultryHouseConcurrencyTest.php backend/tests/Unit/MariaDbPoultryHousePrivilegeTest.php
```

The configuration guard verifies the private temp directory, datadir, actual version, TCP port and loopback binding. An absent server/configuration means stop; do not substitute a hosting connection. The tests create and remove only their own random schemas/accounts. They never clean a whole namespace. The restricted privilege tests create temporary identities on this private test server, reduce their grants, exercise activation and remove them after dropping their fixture schemas.

`MariaDbHouseOperations` and the worker are synthetic database transaction harnesses, not replacement application services. They test assignment/event/reading boundaries and native constraints without enabling the application on a fabricated readiness state, sending providers or modifying firmware. Full controller/UI/monitoring/SMS integration, protected restore, binary-logging privilege behavior and Hostinger infrastructure remain unverified. See the root Phase 8 report for precise executed evidence and GO/NO-GO boundaries.
