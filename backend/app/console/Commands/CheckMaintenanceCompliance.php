<?php

namespace App\Console\Commands;

use App\Models\Farm;
use App\Models\Notification;
use App\Models\User;
use App\Services\MaintenanceStatusService;
use Illuminate\Console\Command;

class CheckMaintenanceCompliance extends Command
{
    protected $signature = 'compliance:check-maintenance';
    protected $description = 'Notify farm owners and admins about overdue manure clean-out records';

    public function handle(MaintenanceStatusService $statusService)
    {
        $farms  = Farm::where('status', 'Active')->get();
        $admins = User::where('role', 'admin')->where('status', 'active')->get();

        $notifiedCount = 0;

        foreach ($farms as $farm) {
            $status = $statusService->getStatus($farm);

            if ($status['status'] !== 'Overdue') {
                continue;
            }

            // Avoid re-notifying every single day a farm stays overdue —
            // only re-send once a week per farm, so this doesn't spam
            // the same people daily for a still-unresolved issue.
            $alreadyNotifiedRecently = Notification::where('type', 'maintenance_overdue')
                ->where('message', 'like', "%\"{$farm->farm_name}\"%")
                ->where('created_at', '>=', now()->subDays(7))
                ->exists();

            if ($alreadyNotifiedRecently) {
                continue;
            }

            if ($farm->user_id) {
                Notification::create([
                    'user_id' => $farm->user_id,
                    'title'   => 'Manure Clean-out Overdue',
                    'message' => "Your farm \"{$farm->farm_name}\" is overdue for its manure clean-out by {$status['days_overdue']} day(s). Please log a clean-out record as soon as possible.",
                    'type'    => 'maintenance_overdue',
                    'is_read' => false,
                ]);
            }

            foreach ($admins as $admin) {
                Notification::create([
                    'user_id' => $admin->id,
                    'title'   => 'Farm Non-Compliance: Manure Clean-out',
                    'message' => "\"{$farm->farm_name}\" ({$farm->owner_name}) is overdue for manure clean-out by {$status['days_overdue']} day(s).",
                    'type'    => 'maintenance_overdue',
                    'is_read' => false,
                ]);
            }

            $notifiedCount++;
        }

        $this->info("Compliance check complete. {$notifiedCount} overdue farm(s) notified.");
    }
}