<?php

use Illuminate\Database\ConcurrencyErrorDetector;
use Tests\Support\MariaDbHouseOperations as Operations;
use Tests\Support\MariaDbPoultryHouseFixture as Fixture;

require dirname(__DIR__, 2).'/vendor/autoload.php';

try {
    if (getenv('POULTRY_HOUSE_MARIADB_PROTOTYPE') !== '1') {
        throw new RuntimeException('Fixture opt-in required.');
    }
    $input = json_decode(stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR);
    $pdo = Fixture::connect($input['database']);
    $q = $pdo->prepare('SELECT token_sha256 FROM phase8_fixture_ownership');
    $q->execute();
    if ($q->fetchAll(PDO::FETCH_COLUMN) !== [hash('sha256', $input['token'])]) {
        throw new RuntimeException('Ownership mismatch.');
    }
    if (! in_array($input['isolation'] ?? '', ['REPEATABLE READ', 'READ COMMITTED'], true)) {
        throw new RuntimeException('Invalid fixture isolation.');
    }
    $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL '.$input['isolation']);
    $pdo->exec('SET SESSION innodb_lock_wait_timeout=8');
    $id = (int) $pdo->query('SELECT CONNECTION_ID()')->fetchColumn();
    echo 'READY:'.$id.PHP_EOL;
    flush();
    $retryCodes = [];
    for ($attempt = 1; $attempt <= 3; $attempt++) {
        try {
            $autocommit = $input['operation'] === 'autocommit_assign';
            if (! $autocommit) {
                $pdo->beginTransaction();
            }
            switch ($input['operation']) {
                case 'assign':
                    Operations::assign($pdo, (int) $input['sensor'], (int) $input['farm'], (int) $input['house']);
                    break;
                case 'activate':
                    $pdo->exec("UPDATE sensors SET status='Active' WHERE id=".(int) $input['sensor']);
                    break;
                case 'deactivate_house':
                    $pdo->exec("UPDATE poultry_houses SET status='Inactive' WHERE id=".(int) $input['house']);
                    break;
                case 'ingest':
                    Operations::ingest($pdo, (int) $input['sensor']);
                    break;
                case 'autocommit_assign':
                    $q = $pdo->prepare('UPDATE sensors SET farm_id=?,poultry_house_id=?,current_assignment_event_id=? WHERE id=?');
                    $q->execute([(int) $input['farm'], (int) $input['house'], (int) $input['event'], (int) $input['sensor']]);
                    break;
                default:
                    throw new RuntimeException('Unsupported fixture operation.');
            }
            if (! $autocommit) {
                $pdo->commit();
            }
            echo json_encode(['status' => 'ok', 'attempts' => $attempt, 'retry_codes' => $retryCodes]).PHP_EOL;
            exit(0);
        } catch (PDOException $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $code = (int) ($error->errorInfo[1] ?? 0);
            if ((new ConcurrencyErrorDetector)->causedByConcurrencyError($error) && $attempt < 3) {
                $retryCodes[] = $code;

                continue;
            }
            echo json_encode(['status' => 'rejected', 'sqlstate' => $error->errorInfo[0] ?? '', 'code' => $code, 'attempts' => $attempt, 'retry_codes' => $retryCodes]).PHP_EOL;
            exit(0);
        }
    }
} catch (Throwable $error) {
    fwrite(STDERR, 'Fixture worker failed: '.get_class($error).PHP_EOL);
    exit(1);
}
