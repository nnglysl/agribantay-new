<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Mail\OtpCodeMail;
use App\Models\ActivityLog;
use App\Models\AiRecommendation;
use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Models\MaintenanceNotification;
use App\Models\ManureDisposalRecord;
use App\Models\PoultryHouse;
use App\Models\Recommendation;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\SmsLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;

/**
 * Permanent farm deletion — Super Admin only, Deactivated farms only, and
 * only after a 6-digit code emailed to the Super Admin is entered.
 *
 * The code lives in the cache (hashed) under a key scoped to BOTH the
 * requesting Super Admin and the farm, expires with the cache TTL, and is
 * forgotten the moment it's used — so it's single-use and can't be replayed
 * against a different farm. Requesting again ("resend") simply overwrites it.
 */
class FarmDeletionController extends Controller
{
    private const OTP_TTL_MINUTES = 10;

    private static function otpKey(int $userId, int $farmId): string
    {
        return "farm-delete-otp:{$userId}:{$farmId}";
    }

    /**
     * Only Deactivated farms may be deleted; everything else is a 422 so the
     * rule holds even for hand-crafted requests.
     */
    private function deletableFarm(int $id): Farm
    {
        $farm = Farm::findOrFail($id);

        if ($farm->status !== 'Deactivated') {
            abort(422, 'Only a deactivated farm can be deleted. Deactivate the farm first.');
        }

        return $farm;
    }

    /** Step 1 (and "Resend"): email a fresh code to the Super Admin. */
    public function requestOtp(int $id)
    {
        $farm = $this->deletableFarm($id);
        $user = Auth::user();

        if (!$user->email) {
            return response()->json([
                'success' => false,
                'message' => 'Your account has no registered email address, so a verification code cannot be sent.',
            ], 422);
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Cache::put(
            self::otpKey($user->id, $farm->id),
            ['hash' => Hash::make($code)],
            now()->addMinutes(self::OTP_TTL_MINUTES)
        );

        try {
            Mail::to($user->email)->send(new OtpCodeMail($user, $code, 'farm_deletion'));
        } catch (\Throwable $e) {
            report($e);
            Cache::forget(self::otpKey($user->id, $farm->id));

            return response()->json([
                'success' => false,
                'message' => 'Failed to send the verification code. Please try again.',
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => "A verification code has been sent to {$user->email}.",
            'expires_in_minutes' => self::OTP_TTL_MINUTES,
        ]);
    }

    /**
     * Step 2: verify the code, then delete the farm and every record that
     * hangs off it inside one transaction. Nothing is removed unless the
     * code matches; if any delete fails the whole transaction rolls back
     * and the farm is left exactly as it was.
     */
    public function destroy(Request $request, int $id)
    {
        $request->validate(['code' => 'required|string|size:6']);

        $farm = $this->deletableFarm($id);
        $user = Auth::user();
        $key  = self::otpKey($user->id, $farm->id);

        $otp = Cache::get($key);

        if (!$otp) {
            return response()->json([
                'success' => false,
                'message' => 'Verification code has expired. Please request a new code.',
            ], 422);
        }

        if (!Hash::check($request->code, $otp['hash'])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid verification code.',
            ], 422);
        }

        // Single-use: consumed before the delete so a retry with the same
        // code after a failure has to request a new one.
        Cache::forget($key);

        $farmName  = $farm->farm_name;
        $ownerName = $farm->owner_name;

        try {
            DB::transaction(function () use ($farm) {
                // Records that belong to the farm and go with it.
                MaintenanceNotification::where('farm_id', $farm->id)->delete();
                MaintenanceLog::where('farm_id', $farm->id)->delete();
                ManureDisposalRecord::where('farm_id', $farm->id)->delete();
                AlertHistory::where('farm_id', $farm->id)->delete();
                AiRecommendation::where('farm_id', $farm->id)->delete();
                Recommendation::where('farm_id', $farm->id)->delete();
                Inspection::where('farm_id', $farm->id)->delete();
                ServiceRequest::where('farm_id', $farm->id)->delete();
                SensorReading::where('farm_id', $farm->id)->delete();
                PoultryHouse::where('farm_id', $farm->id)->delete();

                // Physical devices outlive the farm: detach rather than delete
                // (same as the existing unassign action), so the unit can be
                // registered to another farm later.
                Sensor::where('farm_id', $farm->id)->update(['farm_id' => null, 'poultry_house_id' => null]);

                // SMS history is an audit trail of messages actually sent;
                // keep it, just drop the pointer to the farm.
                SmsLog::where('farm_id', $farm->id)->update(['farm_id' => null]);

                $farm->delete();
            });
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'The farm could not be deleted. No changes were made — please try again.',
            ], 500);
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'role'    => $user->role,
            'action'  => 'Deleted Farm',
            'details' => "Permanently deleted farm: {$farmName} — {$ownerName} (by {$user->full_name}, " . now()->format('M j, Y g:i A') . ')',
            'type'    => 'Farm',
        ]);

        return response()->json([
            'success' => true,
            'message' => "{$farmName} has been permanently deleted.",
        ]);
    }
}
