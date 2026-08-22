<?php

namespace App\Console\Commands;

use App\Models\Farm;
use App\Models\Notification;
use App\Models\MaintenanceNotification;
use App\Models\SmsLog;
use App\Models\User;
use App\Services\MaintenanceStatusService;
use App\Services\SmsService;
use Illuminate\Console\Command;

/**
 * Objective 5.1/5.2 — manure clean-out compliance SMS + notifications.
 * Runs daily (see routes/console.php). Each farm gets AT MOST one SMS
 * per event per clean-out cycle, enforced by the unique constraint on
 * maintenance_notifications(farm_id, event, anchor_date) — running this
 * command multiple times a day, or every day a farm remains overdue,
 * will not re-send.
 */
class CheckMaintenanceCompliance extends Command
{
    protected $signature = 'compliance:check-maintenance';
    protected $description = 'Send once-per-cycle SMS/notifications for overdue and non-compliant manure clean-outs';

    public function handle(MaintenanceStatusService $statusService, SmsService $sms)
    {
        $farms  = Farm::where('status', 'Active')->get();
        $admins = User::whereIn('role', ['admin', 'super_admin'])->where('status', 'active')->get();

        $sentCount = 0;

        foreach ($farms as $farm) {
            $status = $statusService->getStatus($farm);

            $event = match ($status['status']) {
                'Overdue'       => 'overdue_reminder',
                'Non-Compliant' => 'non_compliant_notice',
                default         => null,
            };

            if (!$event) {
                continue; // 'Scheduled' — nothing to notify about
            }

            $alreadySent = MaintenanceNotification::where('farm_id', $farm->id)
                ->where('event', $event)
                ->where('anchor_date', $status['anchor_date'])
                ->exists();

            if ($alreadySent) {
                continue;
            }

            $message = $event === 'overdue_reminder'
                ? 'Your manure clean-out is overdue. Please clean and properly dispose of accumulated manure and update your manure record.'
                : 'Your manure clean-out is still overdue and has exceeded the 30-day grace period. Please complete the required clean-out and update your manure record.';

            $smsLogId = null;

            if ($farm->mobile_number) {
                $sms->send($farm->mobile_number, $message, 'Maintenance Compliance', $farm->user_id, $farm->id);

                // send() logs internally but doesn't return the row —
                // fetch the one it just created so we can link it below.
                $smsLogId = SmsLog::where('farm_id', $farm->id)
                    ->where('type', 'Maintenance Compliance')
                    ->latest('id')
                    ->value('id');
            }

            if ($farm->user_id) {
                Notification::create([
                    'user_id' => $farm->user_id,
                    'title'   => $event === 'overdue_reminder' ? 'Manure Clean-out Overdue' : 'Manure Clean-out Non-Compliant',
                    'message' => $message,
                    'type'    => 'maintenance_overdue',
                    'is_read' => false,
                ]);
            }

            foreach ($admins as $admin) {
                Notification::create([
                    'user_id' => $admin->id,
                    'title'   => $event === 'overdue_reminder'
                        ? 'Farm Overdue: Manure Clean-out'
                        : 'Farm Non-Compliant: Manure Clean-out',
                    'message' => "\"{$farm->farm_name}\" ({$farm->owner_name}) — {$status['status']}, {$status['days_overdue']} day(s) past the grace period.",
                    'type'    => 'maintenance_overdue',
                    'is_read' => false,
                ]);
            }

            MaintenanceNotification::create([
                'farm_id'     => $farm->id,
                'event'       => $event,
                'anchor_date' => $status['anchor_date'],
                'sms_log_id'  => $smsLogId,
                'sent_at'     => now(),
            ]);

            $sentCount++;
        }

        $this->info("Compliance check complete. {$sentCount} notification(s) sent.");
    }
}