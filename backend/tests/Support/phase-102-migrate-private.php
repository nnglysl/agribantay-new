<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

// Test-only runner for the exact reviewed files. Never accepts an operational DB.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$paths = [
    'database/approval-required/2026_10_31_120000_protect_sole_super_admin.php',
    'database/migrations/2026_10_31_000000_create_farm_control_documents_table.php',
];
$path = $argv[1] ?? '';
if (getenv('PHASE102_TEST_MYSQL') !== '1' || ! in_array($path, $paths, true)) {
    exit(2);
}
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();
$db = DB::connection();
if ($db->getDriverName() !== 'mysql'
    || ! preg_match('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', $db->getDatabaseName())
    || ! in_array($db->getConfig('host'), ['127.0.0.1', 'localhost', '::1'], true)
    || $db->getConfig('url')) {
    exit(3);
}
$exit = $kernel->call('migrate', ['--path' => [$path], '--force' => true, '--no-interaction' => true]);
echo $kernel->output();
echo json_encode(['guarded_private_database' => $db->getDatabaseName(),
    'applied' => $db->table('migrations')->orderBy('migration')->pluck('migration')->all(),
    'optional_voltage_present' => $db->getSchemaBuilder()->hasColumn('sensor_readings', 'ammonia_adc_mv'),
    'document_table_present' => $db->getSchemaBuilder()->hasTable('farm_control_documents')], JSON_THROW_ON_ERROR)."\n";
exit($exit);
