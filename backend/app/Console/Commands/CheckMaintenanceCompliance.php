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
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

/** One reserved notice per farm / annual cycle; delivery transition is opt-in. */
class CheckMaintenanceCompliance extends Command
{
    protected $signature = 'compliance:check-maintenance';
    protected $description = 'Send approved annual full clean-out non-compliance notices once per cycle';

    public function handle(MaintenanceStatusService $service, SmsService $sms): int
    {
        if (!config('maintenance_compliance.notifications_enabled')) {
            $this->info('Annual clean-out notifications are disabled pending operational transition approval.');
            return self::SUCCESS;
        }
        $start = config('maintenance_compliance.notification_start_date');
        if (!is_string($start) || !preg_match('/\A(\d{4})-(\d{2})-(\d{2})\z/', $start, $date)
            || !checkdate((int) $date[2], (int) $date[3], (int) $date[1])) {
            $this->error('An explicitly approved notification start date (YYYY-MM-DD) is required. No notices sent.');
            return self::FAILURE;
        }
        if ($start > Carbon::now('Asia/Manila')->toDateString()) {
            $this->info('The approved notification transition has not started.');
            return self::SUCCESS;
        }
        $recipients = User::whereIn('role', ['admin', 'super_admin'])->where('status', 'active')->get();
        $count = 0;
        foreach (Farm::where('status', 'Active')->orderBy('id')->pluck('id') as $id) {

            $claim = DB::transaction(function () use ($id, $start, $service) {
                $farm = Farm::whereKey($id)->where('status', 'Active')->lockForUpdate()->first();
                if (!$farm) return null;
                $status = $service->getStatus($farm);
                if ($status['status'] !== 'Non-Compliant' || $status['non_compliant_from'] < $start) return null;
                if (MaintenanceNotification::where('farm_id', $id)->where('event', 'non_compliant_notice')->where('anchor_date', $status['anchor_date'])->exists()) return null;
                $notice = MaintenanceNotification::create(['farm_id' => $id, 'event' => 'non_compliant_notice',
                    'anchor_date' => $status['anchor_date'], 'sent_at' => now()]);
                return [$farm, $status, $notice];
            }, 3);
            if (!$claim) continue;
            [$farm, $status, $notice] = $claim;
            $message = 'Your annual full manure clean-out was due on '.$status['due_date'].'. Your farm is Non-Compliant. Please complete a full clean-out and update your clean-out record.';

            if ($farm->mobile_number) {
                $token = (string) \Illuminate\Support\Str::uuid();
                $sms->sendWithOutcome($farm->mobile_number, $message, 'Maintenance Compliance', $farm->user_id, $farm->id, null, $token);
                $notice->update(['sms_log_id' => SmsLog::where('sms_alert_token', $token)->value('id')]);
            }
            DB::transaction(function () use ($farm, $message, $status, $recipients) {
                if ($farm->user_id) Notification::create(['user_id' => $farm->user_id,
                    'title' => 'Annual Manure Clean-out Non-Compliant', 'message' => $message,
                    'type' => 'maintenance_overdue', 'link' => '/farmowner/manure-records', 'is_read' => false]);
                foreach ($recipients as $recipient) Notification::create(['user_id' => $recipient->id,
                    'title' => 'Farm Non-Compliant: Annual Manure Clean-out',
                    'message' => '"'.$farm->farm_name.'" - Non-Compliant, '.$status['days_overdue'].' day(s) past the full clean-out due date ('.$status['due_date'].').',
                    'type' => 'maintenance_overdue',
                    'link' => ($recipient->role === 'super_admin' ? '/superadmin/farms/' : '/admin/farms/').$farm->id,
                    'is_read' => false]);
            });
            $count++;
        }
        $this->info('Annual compliance check complete. '.$count.' event(s) reserved; delivery outcomes remain in SMS history.');
        return self::SUCCESS;
    }
}
