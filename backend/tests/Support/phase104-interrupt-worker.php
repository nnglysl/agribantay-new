<?php

require __DIR__.'/phase104-guard.php';
$app=require dirname(__DIR__,2).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Tests\Support\Phase104Database::connect(Illuminate\Support\Facades\DB::connection()->getDatabaseName());
Illuminate\Support\Facades\DB::listen(function($event) {
    if(str_starts_with($event->sql,'CREATE TRIGGER agribantay_users_super_admin_bi')) {
        echo "FIRST_GUARD_INSTALLED\n"; fflush(STDOUT);
        // Exit the installer immediately after the first committed DDL step.
        // Do not invoke later migration steps or any cleanup/rollback path.
        exit(77);
    }
});
(require dirname(__DIR__,2).'/database/approval-required/2026_10_31_130000_protect_sole_super_admin_mariadb.php')->up();
