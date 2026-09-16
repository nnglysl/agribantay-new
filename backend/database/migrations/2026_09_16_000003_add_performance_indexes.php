<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes for the columns the list/dashboard endpoints filter and sort on.
 * Every one of these was a full-table scan before (only primary/foreign keys
 * existed). Data is untouched; each index is created only if it doesn't
 * already exist so the migration is safe to re-run.
 */
return new class extends Migration
{
    private const INDEXES = [
        'farms'            => [['status'], ['current_status'], ['barangay'], ['status', 'current_status']],
        'users'            => [['role', 'status']],
        'service_requests' => [['status'], ['service_type', 'status'], ['scheduled_at'], ['completed_at'], ['created_at']],
        'inspections'      => [['status'], ['scheduled_at'], ['completed_at'], ['status', 'scheduled_at']],
        'sensor_readings'  => [['farm_id', 'created_at']],
        'notifications'    => [['user_id', 'is_read'], ['user_id', 'created_at']],
        'activity_logs'    => [['created_at'], ['type']],
        'alert_history'    => [['triggered_at'], ['resolved_at']],
        'maintenance_logs' => [['farm_id', 'maintenance_type', 'performed_at']],
    ];

    private function indexName(string $table, array $columns): string
    {
        return $table . '_' . implode('_', $columns) . '_perf_idx';
    }

    private function hasIndex(string $table, string $name): bool
    {
        return count(DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$name])) > 0;
    }

    public function up(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            foreach ($indexes as $columns) {
                $name = $this->indexName($table, $columns);
                if ($this->hasIndex($table, $name)) {
                    continue;
                }
                Schema::table($table, fn (Blueprint $t) => $t->index($columns, $name));
            }
        }
    }

    public function down(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            foreach ($indexes as $columns) {
                $name = $this->indexName($table, $columns);
                if ($this->hasIndex($table, $name)) {
                    Schema::table($table, fn (Blueprint $t) => $t->dropIndex($name));
                }
            }
        }
    }
};
