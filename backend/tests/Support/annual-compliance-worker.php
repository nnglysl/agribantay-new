<?php
// Independent test process; refuse all operational database names/hosts.
if (getenv('DB_CONNECTION') !== 'mysql' || getenv('DB_URL')
    || !preg_match('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', getenv('DB_DATABASE') ?: '')
    || !in_array(getenv('DB_HOST'), ['127.0.0.1', 'localhost', '::1'], true)) exit(2);
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Illuminate\Support\Carbon::setTestNow(Illuminate\Support\Carbon::parse('2026-11-01 04:00:00', 'UTC'));
config(['maintenance_compliance.notifications_enabled' => true, 'maintenance_compliance.notification_start_date' => '2026-11-01']);
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\Http::fake(function () {
    usleep(300000); // Overlap the two command processes after reservation.
    return Illuminate\Support\Facades\Http::response(['message' => ['status' => 'sent', 'reference_id' => 'synthetic-race-only']], 200);
});
exit(Illuminate\Support\Facades\Artisan::call('compliance:check-maintenance'));
