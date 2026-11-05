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
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\SmsLog;
use App\Services\DeviceAssignmentService;
use App\Services\PoultryHouseFoundationReadiness;
use App\Support\DummyHouseInventory;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Permanent farm deletion — Super Admin only, Deactivated farms only, and
 * only after a 6-digit code emailed to the Super Admin is entered.
 *
 */
class FarmDeletionController extends Controller
{
    private const OTP_TTL_MINUTES = 10;

    private function confirmClosure(Request $request): void
    {
        abort_unless(Auth::user()?->role === 'super_admin', 403, 'Only a Super Admin may permanently delete a farm.');
        $request->validate([
            'permanently_discontinued' => 'required|accepted',
            'acknowledge_permanent_loss' => 'required|accepted',
        ]);
    }
    private function assertEligible(Farm $farm): void
    {
        abort_unless($farm->status === 'Deactivated', 422, 'Only a deactivated farm can be deleted.');
        $houseIds = [];
        if (Schema::hasTable('poultry_houses')) {
            abort_unless(app(PoultryHouseFoundationReadiness::class)->inspect()['ready'], 503,
                'The poultry house foundation is incomplete or incompatible. Stop deletion and request an installation review.');
            abort_unless(Schema::hasTable('poultry_house_initializations')
                && Schema::hasColumns('farms', ['last_house_number', 'house_inventory_verified_at'])
                && Schema::hasColumns('sensors', ['poultry_house_id', 'current_assignment_event_id', 'active_house_slot'])
                && Schema::hasColumns('sensor_readings', ['poultry_house_id', 'assignment_event_id'])
                && Schema::hasColumns('alert_history', ['poultry_house_id', 'assignment_event_id']), 503,
                'The poultry house foundation is incomplete. Stop deletion and request an installation review.');
            $houses = DB::table('poultry_houses')->where('farm_id', $farm->id)->orderBy('id')->lockForUpdate()->get();
            $houseIds = $houses->pluck('id')->all();
            abort_if($houses->contains('status', 'Active'), 422,
                'Deactivate every poultry house before permanently deleting this farm.');
            // An empty inventory is not proof that an existing farm has no houses.
            $initialization = DB::table('poultry_house_initializations')->where('farm_id', $farm->id)->first();
            $verified = $farm->house_inventory_verified_at && $initialization
                && ! DummyHouseInventory::marked($initialization->verification_reference)
                && trim($initialization->verification_reference) !== ''
                && in_array($initialization->verifier_role, ['admin', 'super_admin'], true);
            abort_unless($verified, 422,
                'House inventory and closure information remain unverified. Complete an authorized inventory verification before deletion.');
        }
        $devices = DB::table('sensors')->where(function ($query) use ($farm, $houseIds) {
            $query->where('farm_id', $farm->id);
            if ($houseIds) {
                $query->orWhereIn('poultry_house_id', $houseIds);
            }
        })->exists();
        abort_if($devices, 422,
            'Explicitly unassign every Active and Inactive device from this farm and its houses before deletion.');
        if (Schema::hasTable('farm_control_documents')) {
            abort_if(DB::table('farm_control_documents')->where('farm_id', $farm->id)->exists(), 422,
                'Protected Control Documents prevent deletion. Retain this farm or obtain an authorized retention review; documents will not be removed automatically.');
        }
    }

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
    public function requestOtp(Request $request, int $id)
    {
        $this->confirmClosure($request);
        $farm = $this->deletableFarm($id);
        $user = Auth::user();
        app(DeviceAssignmentService::class)->withLockedFarm($id, function ($locked) {
            abort_unless($locked, 404);
            $this->assertEligible($locked);
        });

        if (! $user->email) {
            return response()->json([
                'success' => false,
                'message' => 'Your account has no registered email address, so a verification code cannot be sent.',
            ], 422);
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Cache::put(
            self::otpKey($user->id, $farm->id),
            ['hash' => Hash::make($code), 'closure_confirmed' => true],
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
        $this->confirmClosure($request);
        $request->validate(['code' => 'required|string|size:6']);

        $farm = $this->deletableFarm($id);
        $user = Auth::user();
        $key = self::otpKey($user->id, $farm->id);

        $farmName = $farm->farm_name;
        $ownerName = $farm->owner_name;
        $ownerDeleted = false;

        try {
            $assignments = app(DeviceAssignmentService::class);
            $assignments->withLockedFarm($farm->id, function ($farm) use ($request, $key, &$ownerDeleted, $user, $farmName, $ownerName) {
                // Recheck the policy after the sensor-first barrier. Another
                // request may have changed the farm while this one waited.
                abort_unless($farm && $farm->status === 'Deactivated', 422,
                    'Only a deactivated farm can be deleted.');

                // Serialize OTP consumption with deletion. Even a failed delete
                // consumes a valid code; cache is deliberately outside DB rollback.
                $otp = Cache::get($key);
                abort_unless($otp && ($otp['closure_confirmed'] ?? false), 422,
                    'Verification code has expired. Please request a new code.');
                abort_unless(Hash::check($request->code, $otp['hash']), 422, 'Invalid verification code.');
                Cache::forget($key);
                $this->assertEligible($farm);

                // Records that belong to the farm and go with it.
                MaintenanceNotification::where('farm_id', $farm->id)->delete();
                MaintenanceLog::where('farm_id', $farm->id)->delete();
                ManureDisposalRecord::where('farm_id', $farm->id)->delete();
                AlertHistory::where('farm_id', $farm->id)->delete();
                AiRecommendation::where('farm_id', $farm->id)->delete();
                Inspection::where('farm_id', $farm->id)->delete();
                ServiceRequest::where('farm_id', $farm->id)->delete();
                SensorReading::where('farm_id', $farm->id)->delete();

                // SMS history is an audit trail of messages actually sent;
                // keep it, just drop the pointer to the farm.
                SmsLog::where('farm_id', $farm->id)->update(['farm_id' => null]);

                $owner = $farm->user;

                if (Schema::hasTable('poultry_houses')) {
                    // Option A exception: only the authorized parent deletion
                    // removes these operational rows. Retained ledgers have no
                    // parent FK and are intentionally left untouched.
                    DB::table('poultry_houses')->where('farm_id', $farm->id)->delete();
                }
                $farm->delete();

                // The owner account lives exactly as long as the owner has at
                // least one farm. Counted AFTER the delete above and inside the
                // same transaction, so the number is the real remaining count
                // and cannot be raced by a farm being added or removed in
                // between.
                //
                // Any status a farm happens to hold is irrelevant here — a
                // Deactivated farm is still a farm, so an owner holding one is
                // never deleted.
                if ($owner && $owner->role === 'farm_owner') {
                    $remaining = Farm::where('user_id', $owner->id)->count();

                    if ($remaining === 0) {
                        // Sanctum's personal_access_tokens has no foreign key
                        // to users, so deleting the row would leave the tokens
                        // behind. They are dropped first: the guard would fail
                        // to resolve a deleted owner anyway, but an orphaned
                        // credential row should not outlive the account.
                        $owner->tokens()->delete();
                        $owner->delete();
                        $ownerDeleted = true;
                    }
                }

                ActivityLog::create([
                    'user_id' => $user->id,
                    'role' => $user->role,
                    'action' => 'Deleted Farm',
                    'details' => "Permanently deleted farm: {$farmName} — {$ownerName} (by {$user->full_name}, ".now()->format('M j, Y g:i A').')'
                        .($ownerDeleted
                            ? " — this was the owner's last farm, so the owner account was deleted"
                            : ' — the owner keeps their account and remaining farms')
                        .' — permanent discontinuation verified; permanent operational-data loss acknowledged; devices explicitly unassigned; house inventory checked',
                    'type' => 'Farm',
                ]);
            });
        } catch (HttpExceptionInterface|ValidationException $e) {
            throw $e;
        } catch (QueryException $e) {
            report($e);
            $integrityFailure = str_starts_with((string) ($e->errorInfo[0] ?? ''), '23');

            return response()->json(['success' => false,
                'message' => $integrityFailure
                    ? 'A protected relationship or database constraint prevented deletion. No deletion changes were saved. Request a retention/schema review and a new code.'
                    : 'A database error prevented deletion. No deletion changes were saved. Request an operator review and a new code.'], $integrityFailure ? 422 : 500);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'The farm could not be deleted. No changes were made — please try again.',
            ], 500);
        }

        return response()->json([
            'success' => true,
            'owner_deleted' => $ownerDeleted,
            'message' => $ownerDeleted
                ? "{$farmName} has been permanently deleted. It was {$ownerName}'s last farm, so their Farm Owner account was deleted as well."
                : "{$farmName} has been permanently deleted. {$ownerName} keeps their account and remaining farms.",
        ]);
    }
}
