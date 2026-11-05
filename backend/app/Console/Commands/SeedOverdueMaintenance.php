<?php
namespace App\Console\Commands;

use Illuminate\Console\Command;

/** Kept as a safe compatibility entry point for old operator scripts. */
class SeedOverdueMaintenance extends Command
{
    protected $signature = 'maintenance:seed-overdue {--target=100} {--force}';
    protected $description = 'Retired: registration backdating is prohibited under annual compliance';

    public function handle(): int
    {
        $this->error('This demo backdating command is retired. No records were changed. Use isolated synthetic annual-policy tests.');
        return self::FAILURE;
    }
}