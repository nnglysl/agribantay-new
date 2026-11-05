# Controlled dummy-house initialization

This preparation has **no HTTP route, scheduled job, seeder or operational launcher**. No operational manifest or operational dry-run was produced. The internal `DummyFarmInitializationService` exposes `preview(actor, manifest, approvedHash)` and `apply(actor, manifest, approvedHash)` for a later explicitly approved execution context. Existing registration remains the ordinary path for **new** farms; never re-register existing farms.

## Manifest and approval contract

Only an active Super Admin may preview/apply. The service rereads that account, including under mutation locks. An operator must independently approve the exact manifest and its **canonical JSON SHA-256**, calculated by `DummyFarmInitializationService::digest()`. Associative keys are sorted recursively, list order is retained, and JSON uses unescaped slashes. This is not the raw file-byte SHA-256. A locally supplied hash is an integrity binding, not cryptographic proof of human approval.

Required fields:

```text
version: 1
purpose: dummy_data_assumption
physical_inventory_verified: false
operation_id: new UUID for this approved operation
approval_reference: retained human approval/reference, 1–120 bytes
approved_by: active Super Admin ID
target_sha256: actual engine/version + database + hostname + port + server_id fingerprint
farms: explicit list, 1–1,000 entries, no duplicate IDs
  farm_id: positive integer
  owner_id: expected positive owner ID
  baseline_sha256: digest of the original farm fields, excluding the two house-inventory fields
  house_count: 1
  house_status: Active
```

These are schema instructions, **not an approved manifest**. The eventual actual-target manifest requires separately authorized read-only target/baseline collection and explicit approval. This phase uses only random owned private schemas and synthetic farms. No list is inferred from owner/device counts, an environment name or the statement that another environment contains dummy data.

`target()` and `baseline(farm)` are manifest-authoring helpers. **Do not call them on an operational connection without the separately authorized baseline scope.** All selected farms are reviewed individually. Missing farms, owner/baseline drift, non-Active farms, any unrelated initialization, existing houses/counter/verification timestamp or partial inventory are excluded. An exclusion blocks the **entire batch**; it is never silently skipped. Farms outside the manifest are not enumerated or initialized.

Preview returns each selected farm's `eligible`, `excluded` or `already_initialized` classification, reason, and exact changes. Eligible entries insert one Active House 1, one ledger row and one audit, and change only the counter from zero to one. Physical verification stays NULL; device/history updates are zero. Exact completed replays report zero inserts. An existing inventory under a different manifest is excluded rather than adopted or overwritten.

## Atomicity and evidence

Apply must start outside any caller transaction. One bounded database transaction locks devices first (the existing shared fleet barrier), selected farms in ID order, then the actor. It reclassifies under locks before writing anything. Failure on any farm rolls back **all** selected farms, ledger rows and audits; normal deadlock retries replay the complete transaction at most three times. There are no provider calls or DDL. Rolled-back auto-increment ID gaps are permitted; no committed house number is reused.

For each eligible farm it writes:

- House number 1, Active, with the operation UUID as its per-farm creation request ID.
- `last_house_number=1`, preserving all old farm fields including `updated_at`; `house_inventory_verified_at` remains NULL.
- The existing ledger's technical `source=verified_population`, `initial_house_count=1`, approved manifest digest, actual Super Admin role/ID snapshot, completion time and reserved `DUMMY-ASSUMPTION/v1/<farm-entry-digest>` reference.
- An audit with operation/manifest/approval reference and an explicit statement that one house is a dummy assumption, not physical verification.

The old source enum has only `registration` and `verified_population`; neither migration is edited. The source value is a compatibility carrier for controlled population. **Never interpret that enum alone as proof of a physical survey.** The NULL timestamp, reserved reference, immutable retained digest/audit and API status `dummy_approved` distinguish this operation. `verified_by` records approval authority here, not a physical surveyor.

An exact retry validates its ledger/entry/manifest/approver/operation identity and original House 1. Legitimate later additions or house status changes are retained; replay never resets them. Add House starts at House 2 and uses the existing locked, never-reused counter. Devices remain farm-only until a separately authorized explicit assignment. Earlier readings/alerts remain House not recorded.

## Runtime and closure boundary

`dummy_approved` makes the explicitly assumed inventory usable for house management, explicit assignment and monitoring. Existing roles, occupancy/FKs/triggers, freshness/period isolation and SMS policy remain in force. Existing views display a short assumption notice; no new module or layout is introduced.

The timestamp never claims physical verification. Even setting it manually cannot convert the reserved dummy evidence into verified inventory or Permanent Delete closure certification. Dummy initialization alone does **not** satisfy deletion's independent inventory/closure gate. OTP, farm/house lifecycle, explicit prior unassignment, protected accounts/documents and retention remain unchanged. Do not bypass these protections to delete dummy data.

## Isolated validation

Reuse the positively identified private test servers from Phase 10: MySQL 8.0.46 on loopback **3308**, MariaDB 11.8.9 on loopback **3307**. The harness rejects operational 3306 and reads only the pinned archived schema definitions. It installs the exact selected four definitions with genuine Laravel journaling and the separate metadata procedure, then uses owned restricted credentials. No generic migration command runs.

From `backend`, with the private servers available:

```powershell
$env:APP_KEY='base64:<fresh synthetic 32-byte key>'
$env:PHASE10_RUNTIME_CONFIG='<reviewed private Phase 10 runtime JSON>'
$env:PHASE104_CONFIG='<reviewed private MariaDB runtime JSON>'
$env:POULTRY_HOUSE_PHASE10_REHEARSAL='1'
$env:POULTRY_HOUSE_MARIADB_PROTOTYPE='1'
& C:\xampp\php\php.exe vendor/bin/phpunit tests/Feature/DummyFarmInitializationTest.php tests/Feature/DummyFarmInitializationConcurrencyTest.php
```

The native concurrency observer checks the owned schema's actual waiting connection. It distinguishes an InnoDB row-lock graph from repeated observation of a pending MariaDB native sensor `FOR UPDATE` statement. Both outcomes still require the final committed replay result and exact counts. A pending-statement observation is not labelled an observed row lock. No stress or physical power-loss durability claim follows.

Operational application must wait for actual target identification, backup/restore, maintenance/provider drain, exact foundation/procedure installation and runtime readiness, an accepted real manifest/preview, current matched release and explicit population approval. Phase 10's frozen synthetic release predates this implementation and is not the current deployable release. Do not turn its fixture-only runner into an operational installer by relaxing guards.
