<?php

namespace App\Services;

use App\Mail\TempPasswordMail;
use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\Sensor;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** One registration request owns its account, farms and audit transaction. */
class FarmRegistrationService
{
    private function ownerRules(): array
    {
        return ['first_name' => 'required|string|max:255', 'last_name' => 'required|string|max:255',
            'mobile_number' => ['required', 'string', 'regex:/^09\d{9}$/', 'unique:users,mobile_number'],
            'email' => 'nullable|email|unique:users,email', 'address' => 'required|string',
            'profile_photo' => 'nullable|image|max:5120'];
    }

    public function validateOwner(Request $request): array
    {
        $data = $request->all();
        $data['mobile_number'] = User::normalizeMobileNumber($data['mobile_number'] ?? null);

        return Validator::make($data, $this->ownerRules())->validate();
    }

    public function register(Request $request, bool $newOwnerOnly = false, bool $flat = false): array
    {
        $actor = $request->user();
        abort_unless($actor && in_array($actor->role, ['admin', 'super_admin'], true), 403);
        $input = $request->all();
        $existing = ! empty($input['farm_owner_id']);
        $input['mobile_number'] = User::normalizeMobileNumber($input['mobile_number'] ?? null);
        if ($flat) {
            $input['farms'] = [$input];
        }
        $location = app(FarmLocationService::class);
        $rules = [
            'farm_owner_id' => $newOwnerOnly ? 'prohibited' : ['nullable', 'integer', Rule::exists('users', 'id')->where('role', 'farm_owner')],
            'farms' => 'required|array|min:1', 'farms.*' => 'required|array',
            'farms.*.farm_name' => 'required|string|max:255', 'farms.*.farm_size' => 'required|in:Small,Medium,Large',
            'farms.*.house_count' => 'required|integer|min:1|max:'.PoultryHouseService::MAX_INITIAL_HOUSES,
            'farms.*.id' => 'prohibited', 'farms.*.farm_id' => 'prohibited',
            'farms.*.barangay' => ['required', 'string', Rule::in($location->officialBarangays())],
            'farms.*.lot_number' => 'nullable|string|max:255', 'farms.*.street' => 'nullable|string|max:255',
            'farms.*.landmark' => 'nullable|string|max:255', 'farms.*.address' => 'nullable|string',
            'farms.*.latitude' => 'nullable|numeric|between:-90,90|required_with:farms.*.longitude',
            'farms.*.longitude' => 'nullable|numeric|between:-180,180|required_with:farms.*.latitude',
            'farms.*.farm_type' => 'nullable|string', 'farms.*.farm_area' => 'nullable|numeric',
            'farms.*.farm_area_unit' => 'nullable|in:sqm,hectare',
        ];
        $validated = Validator::make($input, $existing ? $rules : array_merge($rules, $this->ownerRules()), [
            'farms.*.barangay.in' => FarmLocationService::INVALID_BARANGAY_MESSAGE,
        ])->validate();
        $houses = app(PoultryHouseService::class);
        $houses->requireInstalled();
        $operationId = (string) Str::uuid();

        // Resolve all pins and validate every farm before storing any file or
        // account. Network geocoding never runs while database locks are held.
        $farms = [];
        foreach ($validated['farms'] as $i => $farm) {
            $address = implode(', ', array_filter([$farm['lot_number'] ?? null, $farm['street'] ?? null,
                $farm['barangay'], 'San Jose', 'Batangas', 'Philippines']));
            if (empty($farm['lot_number']) && empty($farm['street']) && ! empty($farm['address'])) {
                $address = $farm['address'];
            }
            if (! isset($farm['latitude'], $farm['longitude'])) {
                $coordinates = app(GeocodingService::class)->geocode($address)
                    ?? app(GeocodingService::class)->geocode($farm['barangay'].', San Jose, Batangas, Philippines');
                $farm['latitude'] = $coordinates['latitude'] ?? null;
                $farm['longitude'] = $coordinates['longitude'] ?? null;
            }
            if (! isset($farm['latitude'], $farm['longitude'])) {
                throw ValidationException::withMessages(["farms.{$i}.location" => 'A pinned location is required before this farm can be saved.']);
            }
            $this->checkLocation($farm, $i);
            foreach ($farms as $earlier) {
                if ($location->distanceMeters($farm['latitude'], $farm['longitude'], $earlier['latitude'], $earlier['longitude']) <= $location->radiusMeters()) {
                    throw ValidationException::withMessages(["farms.{$i}.location" => FarmLocationService::CONFLICT_MESSAGE]);
                }
            }
            $farm['address'] = $address.(! empty($farm['landmark']) ? ' (near '.$farm['landmark'].')' : '');
            $farms[] = $farm;
        }

        $password = $existing ? null : Str::random(10);
        $photo = ! $existing && $request->hasFile('profile_photo')
            ? $request->file('profile_photo')->store('profile-photos', 'public') : null;
        if ($photo === false) {
            throw new \RuntimeException('The profile photo could not be stored.');
        }
        try {
            $result = DB::transaction(function () use ($actor, $existing, $validated, $farms, $password, $photo, $houses, $operationId) {
                // Match farm deletion's device-first order before touching an
                // owner. A last-farm deletion must not race a new farm being
                // attached to that same owner. No monitoring state is changed.
                Sensor::orderBy('id')->lockForUpdate()->get(['id']);
                // A dynamically selected existing administrative row serializes
                // registration requests across actors, including duplicate pins.
                // It is only a lock anchor, never an authorization identity.
                // No new lock table, schema or farm uniqueness rule is needed.
                User::whereIn('role', ['admin', 'super_admin'])->orderBy('id')->lockForUpdate()->firstOrFail(['id']);
                $currentActor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
                abort_unless($currentActor->status === 'active' && in_array($currentActor->role, ['admin', 'super_admin'], true), 403);
                if ($existing) {
                    $owner = User::whereKey($validated['farm_owner_id'])->where('role', 'farm_owner')->lockForUpdate()->firstOrFail();
                } else {
                    // Recheck after the registration lock: another request may
                    // have committed the same existing unique contact details.
                    Validator::make($validated, $this->ownerRules())->validate();
                    $owner = User::create(array_intersect_key($validated, array_flip(['first_name', 'last_name', 'mobile_number', 'email', 'address'])) + [
                        'password' => bcrypt($password), 'profile_photo_path' => $photo, 'role' => 'farm_owner',
                        'status' => 'active', 'must_change_password' => true,
                    ]);
                    ActivityLog::create(['user_id' => $currentActor->id, 'role' => $currentActor->role,
                        'action' => 'Created Farm Owner Account', 'details' => 'Created owner account for '.$owner->full_name, 'type' => 'Account']);
                }
                $created = [];
                $checks = [];
                foreach ($farms as $i => $data) {
                    // Repeat the existing location rule under the common lock
                    // against the latest committed registrations and this batch.
                    $checks[] = $this->checkLocation($data, $i);
                    $farm = Farm::create(array_intersect_key($data, array_flip(['farm_name', 'farm_size', 'barangay',
                        'lot_number', 'street', 'landmark', 'address', 'latitude', 'longitude', 'farm_type', 'farm_area', 'farm_area_unit'])) + [
                            'user_id' => $owner->id, 'owner_name' => $owner->full_name,
                            'mobile_number' => $owner->mobile_number, 'status' => 'Active',
                            'municipality' => 'San Jose', 'province' => 'Batangas', 'current_status' => 'Safe',
                        ]);
                    $houses->initializeRegistration($currentActor, $farm, (int) $data['house_count'], $operationId);
                    ActivityLog::create(['user_id' => $currentActor->id, 'role' => $currentActor->role,
                        'action' => $existing ? 'Added Farm to Existing Owner' : 'Registered Farm',
                        'details' => $farm->farm_name.' — '.$owner->full_name, 'type' => 'Farm']);
                    $created[] = $farm;
                }

                return ['user' => $owner, 'farms' => $created, 'locations' => $checks];
            }, 3);
        } catch (\Throwable $error) {
            // Only the new random upload created by THIS request is removed.
            if ($photo) {
                Storage::disk('public')->delete($photo);
            }
            if ($error instanceof QueryException && $error->getCode() === '23000' && ! $existing) {
                Validator::make($validated, $this->ownerRules())->validate();
            }
            throw $error;
        }

        $delivery = ['contact_method' => null, 'delivered' => null, 'sms_sent' => null, 'delivery_pending' => false];
        if (! $existing) {
            $delivery['contact_method'] = $result['user']->email ? 'email' : 'sms';
            if (DB::transactionLevel() > 0) {
                // Also respect an enclosing transaction; never send credentials
                // for records that it may still roll back.
                DB::afterCommit(fn () => $this->deliver($result['user'], $password));
                $delivery['delivery_pending'] = true;
            } else {
                $delivery = $this->deliver($result['user'], $password);
            }
        }

        return $result + $delivery;
    }

    private function checkLocation(array $farm, int $index): array
    {
        $check = app(FarmLocationService::class)->validate((float) $farm['latitude'], (float) $farm['longitude'], $farm['barangay']);
        if (! $check['ok']) {
            throw ValidationException::withMessages(["farms.{$index}.location" => $check['message']]);
        }

        return $check;
    }

    private function deliver(User $user, string $password): array
    {
        $method = $user->email ? 'email' : 'sms';
        try {
            if ($method === 'email') {
                Mail::to($user->email)->send(new TempPasswordMail($user, $password, 'welcome'));
                $sent = true;
            } else {
                $sent = app(SmsService::class)->send(
                    $user->mobile_number,
                    "Welcome to AgriBantay, {$user->first_name}! Your account is ready. Temporary password: {$password}. You will be asked to set a new password on your first visit to the AgriBantay portal.",
                    'Account Creation', $user->id
                );
            }
        } catch (\Throwable $error) {
            report($error);
            $sent = false;
        }

        return ['contact_method' => $method, 'delivered' => $sent,
            'sms_sent' => $method === 'sms' ? $sent : null, 'delivery_pending' => false];
    }
}
