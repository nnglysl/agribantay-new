<?php
namespace Database\Seeders;

use Illuminate\Database\Seeder;

/** The old size/grace demo data must never fabricate annual evidence. */
class OverdueMaintenanceTestSeeder extends Seeder
{
    public function run(): void
    {
        $this->command?->warn('Skipped retired size/grace clean-out demo seeder; no records changed.');
    }
}