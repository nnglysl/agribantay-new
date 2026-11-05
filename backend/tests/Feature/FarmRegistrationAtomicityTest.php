<?php

namespace Tests\Feature;

use App\Mail\TempPasswordMail;
use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\Support\PoultryHouseManagementTestCase;

class FarmRegistrationAtomicityTest extends PoultryHouseManagementTestCase
{
    protected bool $transactional = false;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function farms(): array
    {
        return [
            ['farm_name' => 'Atomic Farm 1', 'farm_size' => 'Small', 'house_count' => 1, 'barangay' => 'Calansayan',
                'latitude' => 13.855, 'longitude' => 121.093, 'lot_number' => 'Lot 1'],
            ['farm_name' => 'Atomic Farm 2', 'farm_size' => 'Medium', 'house_count' => 2, 'barangay' => 'Calansayan',
                'latitude' => 13.855, 'longitude' => 121.103, 'lot_number' => 'Lot 2'],
        ];
    }

    private function registration(int $count = 2): array
    {
        return ['first_name' => 'Atomic', 'last_name' => 'Owner', 'mobile_number' => '09920000001',
            'email' => 'atomic-owner@example.test', 'address' => 'Fixture owner address',
            'farms' => array_slice($this->farms(), 0, $count)];
    }

    public function test_legacy_inline_creation_rolls_back_a_new_owner_when_the_farm_insert_fails(): void
    {
        $users = User::count();
        $farms = Farm::count();
        Farm::creating(fn () => throw new \RuntimeException('Isolated farm insert failure'));
        try {
            $payload = $this->registration(1);
            unset($payload['farms']);
            $response = $this->postJson('/api/admin/farms', array_replace($payload, $this->farms()[0]));
        } finally {
            Farm::flushEventListeners();
        }
        $this->assertSame(500, $response->getStatusCode());
        $this->assertSame($users, User::count());
        $this->assertSame($farms, Farm::count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_second_farm_failure_rolls_back_the_entire_registration_and_audit(): void
    {
        $users = User::count();
        $farms = Farm::count();
        $logs = ActivityLog::count();
        Farm::creating(function ($farm) {
            if ($farm->farm_name === 'Atomic Farm 2') {
                throw new \RuntimeException('Isolated second-farm failure');
            }
        });
        try {
            $response = $this->postJson('/api/admin/farm-owners', $this->registration());
        } finally {
            Farm::flushEventListeners();
        }
        $this->assertSame(500, $response->getStatusCode());
        $this->assertSame($users, User::count());
        $this->assertSame($farms, Farm::count());
        $this->assertSame($logs, ActivityLog::count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_staff_and_super_admin_can_atomically_register_one_or_multiple_farms(): void
    {
        foreach ([$this->admin, $this->user('admin')] as $i => $actor) {
            $payload = $this->registration($i + 1);
            $payload['mobile_number'] = '0992000000'.($i + 1);
            $payload['email'] = 'atomic-'.$i.'@example.test';
            foreach ($payload['farms'] as &$farm) {
                $farm['latitude'] += $i * 0.002;
            }
            unset($farm);
            $response = $this->actingAs($actor, 'sanctum')->postJson('/api/admin/farm-owners', $payload)->assertOk();
            $owner = User::findOrFail($response->json('id'));
            $this->assertSame($i + 1, $owner->farms()->count());
            $this->assertSame('farm_owner', $owner->role);
            $this->assertTrue((bool) $owner->must_change_password);
            foreach ($owner->farms as $farm) {
                $this->assertSame($owner->id, $farm->user_id);
                $this->assertSame($owner->full_name, $farm->owner_name);
                $this->assertSame($owner->mobile_number, $farm->mobile_number);
            }
        }
        Mail::assertSent(TempPasswordMail::class, 2);
    }

    public function test_owner_validation_step_creates_nothing_and_abandoning_it_leaves_no_account(): void
    {
        $users = User::count();
        $logs = ActivityLog::count();
        $payload = $this->registration();
        unset($payload['farms']);
        $this->postJson('/api/admin/farm-owners/validate', $payload)->assertOk();
        $this->assertSame($users, User::count());
        $this->assertSame($logs, ActivityLog::count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_final_registration_requires_at_least_one_farm_and_creates_no_standalone_owner(): void
    {
        $users = User::count();
        $payload = $this->registration();
        unset($payload['farms']);
        $this->postJson('/api/admin/farm-owners', $payload)->assertUnprocessable()->assertJsonValidationErrors('farms');
        $this->assertSame($users, User::count());
        Mail::assertNothingSent();
    }

    public function test_all_required_farm_fields_are_validated_before_any_persistence(): void
    {
        $users = User::count();
        $farms = Farm::count();
        $payload = $this->registration();
        unset($payload['farms'][1]['farm_size']);
        $this->postJson('/api/admin/farm-owners', $payload)->assertUnprocessable()->assertJsonValidationErrors('farms.1.farm_size');
        $this->assertSame($users, User::count());
        $this->assertSame($farms, Farm::count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_owner_fields_required_by_the_existing_form_are_validated_on_the_server(): void
    {
        $users = User::count();
        foreach (['first_name', 'last_name', 'mobile_number', 'address'] as $field) {
            $payload = $this->registration();
            unset($payload[$field]);
            $this->postJson('/api/admin/farm-owners', $payload)->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertSame($users, User::count());
        Mail::assertNothingSent();
    }

    public function test_single_farm_existing_owner_clients_keep_their_response_and_location_errors(): void
    {
        $users = User::count();
        $payload = ['farm_owner_id' => $this->owner->id] + $this->farms()[0];
        $this->postJson('/api/admin/farms', $payload)->assertOk()->assertJsonPath('data.farm.user_id', $this->owner->id);
        $bad = array_replace($payload, ['latitude' => 0, 'longitude' => 0]);
        $this->postJson('/api/admin/farms', $bad)->assertUnprocessable()->assertJsonValidationErrors('location');
        $this->assertSame($users, User::count());
    }

    public function test_existing_owner_batch_creates_no_duplicate_owner_and_rolls_back_on_failure(): void
    {
        $users = User::count();
        $farms = Farm::count();
        Farm::creating(function ($farm) {
            if ($farm->farm_name === 'Atomic Farm 2') {
                throw new \RuntimeException('Isolated second-farm failure');
            }
        });
        try {
            $response = $this->postJson('/api/admin/farms', ['farm_owner_id' => $this->owner->id, 'farms' => $this->farms()]);
        } finally {
            Farm::flushEventListeners();
        }
        $this->assertSame(500, $response->getStatusCode());
        $this->assertSame($users, User::count());
        $this->assertSame($farms, Farm::count());
        $this->postJson('/api/admin/farms', ['farm_owner_id' => $this->owner->id, 'farms' => $this->farms()])->assertOk();
        $this->assertSame($users, User::count());
        $this->assertSame(4, $this->owner->farms()->count());
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_duplicate_new_owner_or_existing_owner_submission_creates_no_duplicate_records(): void
    {
        $payload = $this->registration(1);
        $this->postJson('/api/admin/farm-owners', $payload)->assertOk();
        $users = User::count();
        $farms = Farm::count();
        $this->postJson('/api/admin/farm-owners', $payload)->assertUnprocessable();
        $batch = ['farm_owner_id' => $this->owner->id, 'farms' => [$this->farms()[1]]];
        $this->postJson('/api/admin/farms', $batch)->assertOk();
        $this->postJson('/api/admin/farms', $batch)->assertUnprocessable();
        $this->assertSame($users, User::count());
        $this->assertSame($farms + 1, Farm::count());
        Mail::assertSent(TempPasswordMail::class, 1);
    }

    public function test_failed_registration_removes_only_its_new_profile_photo(): void
    {
        Storage::disk('public')->put('profile-photos/existing.png', 'preserved fixture');
        $photo = UploadedFile::fake()->createWithContent('new.png', base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG5kAAAAASUVORK5CYII='
        ));
        Farm::creating(function ($farm) {
            if ($farm->farm_name === 'Atomic Farm 2') {
                throw new \RuntimeException('Isolated upload rollback');
            }
        });
        try {
            $response = $this->post('/api/admin/farm-owners', $this->registration() + ['profile_photo' => $photo], ['Accept' => 'application/json']);
        } finally {
            Farm::flushEventListeners();
        }
        $this->assertSame(500, $response->getStatusCode());
        $this->assertSame(['profile-photos/existing.png'], Storage::disk('public')->allFiles('profile-photos'));
        $this->assertFalse(User::where('mobile_number', '09920000001')->exists());
        Mail::assertNothingSent();
    }

    public function test_welcome_delivery_happens_only_after_the_whole_registration_commits(): void
    {
        $observed = null;
        Mail::shouldReceive('to')->once()->andReturnSelf();
        Mail::shouldReceive('send')->once()->andReturnUsing(function ($mail) use (&$observed) {
            $observed = [DB::transactionLevel(), $mail->user->farms()->count()];
        });
        $this->postJson('/api/admin/farm-owners', $this->registration())->assertOk()->assertJsonPath('delivered', true);
        $this->assertSame([0, 2], $observed);
    }

    public function test_notification_failure_keeps_a_complete_registration_and_reports_delivery_failure(): void
    {
        Mail::shouldReceive('to')->once()->andReturnSelf();
        Mail::shouldReceive('send')->once()->andThrow(new \RuntimeException('Isolated provider failure'));
        $response = $this->postJson('/api/admin/farm-owners', $this->registration())->assertOk()->assertJsonPath('delivered', false);
        $this->assertSame(2, User::findOrFail($response->json('id'))->farms()->count());
    }

    public function test_late_audit_failure_rolls_back_every_new_record(): void
    {
        $users = User::count();
        $farms = Farm::count();
        $logs = ActivityLog::count();
        ActivityLog::creating(function ($log) {
            if ($log->action === 'Registered Farm' && str_contains($log->details, 'Atomic Farm 2')) {
                throw new \RuntimeException('Isolated final-audit failure');
            }
        });
        try {
            $response = $this->postJson('/api/admin/farm-owners', $this->registration());
        } finally {
            ActivityLog::flushEventListeners();
        }
        $this->assertSame(500, $response->getStatusCode());
        $this->assertSame([$users, $farms, $logs], [User::count(), Farm::count(), ActivityLog::count()]);
        Mail::assertNothingSent();
    }

    public function test_same_farm_names_at_distinct_valid_locations_remain_allowed(): void
    {
        $payload = $this->registration();
        $payload['farms'][1]['farm_name'] = $payload['farms'][0]['farm_name'];
        $response = $this->postJson('/api/admin/farm-owners', $payload)->assertOk();
        $this->assertSame(2, User::findOrFail($response->json('id'))->farms()->count());
    }

    public function test_same_area_within_a_batch_and_non_owner_assignments_are_rejected(): void
    {
        $users = User::count();
        $farms = Farm::count();
        $payload = $this->registration();
        $payload['farms'][1]['latitude'] = $payload['farms'][0]['latitude'];
        $payload['farms'][1]['longitude'] = $payload['farms'][0]['longitude'];
        $this->postJson('/api/admin/farm-owners', $payload)->assertUnprocessable();
        $this->postJson('/api/admin/farms', ['farm_owner_id' => $this->admin->id, 'farms' => $this->farms()])->assertUnprocessable();
        $this->assertSame([$users, $farms], [User::count(), Farm::count()]);
        Mail::assertNothingSent();
    }

    public function test_farmer_cannot_reach_validation_registration_or_existing_owner_batch_creation(): void
    {
        $users = User::count();
        $farms = Farm::count();
        $this->actingAs($this->owner, 'sanctum');
        $this->postJson('/api/admin/farm-owners/validate', $this->registration())->assertForbidden();
        $this->postJson('/api/admin/farm-owners', $this->registration())->assertForbidden();
        $this->postJson('/api/admin/farms', ['farm_owner_id' => $this->owner->id, 'farms' => $this->farms()])->assertForbidden();
        $this->assertSame([$users, $farms], [User::count(), Farm::count()]);
        Mail::assertNothingSent();
    }
}
