<?php

namespace Tests\Feature;

use App\Mail\OtpCodeMail;
use App\Models\ActivityLog;
use App\Models\Farm;
use App\Models\Inspection;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Permanent farm deletion: Super Admin only, Deactivated only, emailed OTP.
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmDeletionTest
 */
class FarmDeletionTest extends TestCase
{
    use DatabaseTransactions;

    private User $superAdmin;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=FarmDeletionTest');
        }

        Mail::fake();
        $this->superAdmin = User::where('role', 'super_admin')->whereNotNull('email')->firstOrFail();
        $this->admin = User::where('role', 'admin')->firstOrFail();
    }

    private function makeFarm(string $status = 'Deactivated'): Farm
    {
        $owner = User::create([
            'first_name'    => 'Del',
            'last_name'     => Str::random(6),
            'mobile_number' => '09' . random_int(100000000, 999999999),
            'password'      => bcrypt('password'),
            'role'          => 'farm_owner',
            'status'        => 'active',
        ]);

        $farm = Farm::create([
            'user_id'       => $owner->id,
            'farm_name'     => 'Doomed Farm ' . Str::random(4),
            'owner_name'    => $owner->full_name,
            'mobile_number' => $owner->mobile_number,
            'barangay'      => 'Calansayan',
            'address'       => 'Test',
            'farm_size'     => 'Small',
            'status'        => $status,
            'latitude'      => 13.8550,
            'longitude'     => 121.0930,
        ]);

        SensorReading::create([
            'farm_id' => $farm->id, 'ammonia' => 10, 'temperature' => 30, 'humidity' => 60, 'moisture' => 40,
            'ammonia_status' => 'Safe', 'temperature_status' => 'Safe', 'humidity_status' => 'Safe', 'moisture_status' => 'Safe',
        ]);
        Inspection::create([
            'inspection_number' => 'INS-T' . random_int(10000, 99999), 'farm_id' => $farm->id, 'scheduled_by' => $this->admin->id,
            'inspection_type' => 'Follow-up', 'status' => 'Scheduled', 'scheduled_at' => now()->addDay(),
        ]);
        ServiceRequest::create([
            'request_number' => 'SR-T' . random_int(10000, 99999), 'farm_id' => $farm->id, 'requested_by' => $owner->id,
            'service_type' => 'Vaccine Request', 'status' => 'Pending', 'priority' => 'High',
        ]);

        return $farm;
    }

    /** Pull the code out of the faked email so the test can enter it. */
    private function requestCodeFor(Farm $farm): string
    {
        $this->actingAs($this->superAdmin)
            ->postJson("/api/superadmin/farms/{$farm->id}/delete/otp/request")
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $code = null;
        Mail::assertSent(OtpCodeMail::class, function (OtpCodeMail $mail) use (&$code) {
            $code = $mail->code;
            return $mail->purpose === 'farm_deletion' && $mail->hasTo($this->superAdmin->email);
        });

        return $code;
    }

    public function test_admin_cannot_request_or_delete(): void
    {
        $farm = $this->makeFarm();

        $this->actingAs($this->admin)->postJson("/api/superadmin/farms/{$farm->id}/delete/otp/request")->assertStatus(403);
        $this->actingAs($this->admin)->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => '123456'])->assertStatus(403);

        $this->assertDatabaseHas('farms', ['id' => $farm->id]);
    }

    public function test_active_farm_cannot_be_deleted(): void
    {
        $farm = $this->makeFarm('Active');

        $this->actingAs($this->superAdmin)
            ->postJson("/api/superadmin/farms/{$farm->id}/delete/otp/request")
            ->assertStatus(422);

        Mail::assertNothingSent();
        $this->assertDatabaseHas('farms', ['id' => $farm->id]);
    }

    public function test_nothing_is_deleted_without_a_valid_code(): void
    {
        $farm = $this->makeFarm();

        // No code requested yet → "expired".
        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => '000000'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Verification code has expired. Please request a new code.');

        $code = $this->requestCodeFor($farm);
        $wrong = $code === '111111' ? '222222' : '111111';

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => $wrong])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Invalid verification code.');

        $this->assertDatabaseHas('farms', ['id' => $farm->id]);
        $this->assertDatabaseHas('inspections', ['farm_id' => $farm->id]);
    }

    public function test_code_expires(): void
    {
        $farm = $this->makeFarm();
        $code = $this->requestCodeFor($farm);

        $this->travel(11)->minutes();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => $code])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Verification code has expired. Please request a new code.');

        $this->assertDatabaseHas('farms', ['id' => $farm->id]);
    }

    public function test_resend_invalidates_the_previous_code(): void
    {
        $farm = $this->makeFarm();
        $first = $this->requestCodeFor($farm);
        Mail::fake();
        $second = $this->requestCodeFor($farm);

        if ($first !== $second) {
            $this->actingAs($this->superAdmin)
                ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => $first])
                ->assertStatus(422);
        }

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => $second])
            ->assertStatus(200);
    }

    public function test_code_is_scoped_to_the_farm_it_was_requested_for(): void
    {
        $farmA = $this->makeFarm();
        $farmB = $this->makeFarm();
        $code = $this->requestCodeFor($farmA);

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farmB->id}", ['code' => $code])
            ->assertStatus(422);

        $this->assertDatabaseHas('farms', ['id' => $farmB->id]);
    }

    public function test_valid_code_deletes_farm_and_records_once_and_logs_it(): void
    {
        $farm = $this->makeFarm();
        $ownerId = $farm->user_id;
        $sensor = Sensor::create(['farm_id' => $farm->id, 'device_key' => 'AGB-T-' . Str::upper(Str::random(5)), 'label' => 'AGB-T', 'status' => 'active']);
        $code = $this->requestCodeFor($farm);

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => $code])
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('farms', ['id' => $farm->id]);
        $this->assertDatabaseMissing('sensor_readings', ['farm_id' => $farm->id]);
        $this->assertDatabaseMissing('inspections', ['farm_id' => $farm->id]);
        $this->assertDatabaseMissing('service_requests', ['farm_id' => $farm->id]);
        // Devices are detached, not destroyed; the owner account is untouched.
        $this->assertDatabaseHas('sensors', ['id' => $sensor->id, 'farm_id' => null]);
        $this->assertDatabaseHas('users', ['id' => $ownerId]);

        $log = ActivityLog::where('action', 'Deleted Farm')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame($this->superAdmin->id, $log->user_id);
        $this->assertSame('super_admin', $log->role);
        $this->assertStringContainsString($farm->farm_name, $log->details);
        $this->assertNotNull($log->created_at);

        // Single-use: the same code can't be replayed (farm is gone → 404).
        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/superadmin/farms/{$farm->id}", ['code' => $code])
            ->assertStatus(404);
        $this->assertNull(Cache::get("farm-delete-otp:{$this->superAdmin->id}:{$farm->id}"));
    }
}
