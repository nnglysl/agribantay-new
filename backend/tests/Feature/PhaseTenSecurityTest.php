<?php

namespace Tests\Feature;

use App\Mail\OtpCodeMail;
use App\Models\ActivityLog;
use App\Models\PasswordResetOtp;
use App\Models\SmsLog;
use App\Models\User;
use App\Services\SmsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class PhaseTenSecurityTest extends TestCase
{
    private bool $transaction = false;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('PHASE10_TEST_MYSQL') !== '1') {
            $this->markTestSkipped('Explicit private fixture required.');
        }
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.mysql.host'), ['127.0.0.1', 'localhost', '::1']);
        DB::beginTransaction();
        $this->transaction = true;
        config(['cache.default' => 'array']);
        Http::preventStrayRequests();
        Mail::fake();
        $this->user = User::create(['first_name' => 'Security', 'last_name' => 'Fixture', 'email' => Str::uuid().'@example.test',
            'mobile_number' => '09'.random_int(100000000, 999999999), 'password' => Hash::make('Old!pass123'),
            'role' => 'farm_owner', 'status' => 'active', 'must_change_password' => false]);
    }

    protected function tearDown(): void
    {
        if ($this->transaction) {
            DB::rollBack();
        }
        parent::tearDown();
    }

    private function token(): string
    {
        $this->postJson('/api/password/otp/request', ['login' => $this->user->email, 'channel' => 'email'])->assertOk();
        $code = null;
        Mail::assertSent(OtpCodeMail::class, function ($mail) use (&$code) {
            $code = $mail->code;

            return true;
        });

        return $this->postJson('/api/password/otp/verify', ['login' => $this->user->email, 'channel' => 'email', 'code' => $code])
            ->assertOk()->json('reset_token');
    }

    private function reset(string $token)
    {
        return $this->postJson('/api/password/reset', ['reset_token' => $token,
            'new_password' => 'New!pass123', 'new_password_confirmation' => 'New!pass123']);
    }

    public function test_legacy_public_reset_cannot_change_password_or_send_a_credential(): void
    {
        $before = $this->user->password;
        $this->postJson('/api/forgot-password', ['login' => $this->user->email])->assertStatus(410);
        $this->assertSame($before, $this->user->fresh()->password);
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_request_and_verification_do_not_change_password_and_code_cannot_be_replayed(): void
    {
        $before = $this->user->password;
        $token = $this->token();
        $otp = PasswordResetOtp::where('user_id', $this->user->id)->firstOrFail();
        $this->assertSame($before, $this->user->fresh()->password);
        $this->assertSame(hash('sha256', $token), $otp->reset_token);
        Mail::assertSent(OtpCodeMail::class, function ($mail) {
            $this->postJson('/api/password/otp/verify', ['login' => $this->user->email, 'channel' => 'email', 'code' => $mail->code])->assertUnprocessable();

            return true;
        });
    }

    public function test_verified_reset_is_single_use_and_expires_existing_bearer_sessions(): void
    {
        $session = $this->user->createToken('synthetic-session')->accessToken;
        $token = $this->token();
        $this->reset($token)->assertOk();
        $this->assertTrue(Hash::check('New!pass123', $this->user->fresh()->password));
        $this->assertTrue($session->fresh()->expires_at->isPast());
        $this->reset($token)->assertUnprocessable();
    }

    public function test_deactivated_account_cannot_complete_previously_verified_recovery(): void
    {
        $token = $this->token();
        $before = $this->user->password;
        $this->user->update(['status' => 'inactive']);
        $this->reset($token)->assertUnprocessable();
        $this->assertSame($before, $this->user->fresh()->password);
    }

    public function test_recovery_consumes_other_outstanding_channel_tokens(): void
    {
        $first = $this->token();
        $second = Str::random(40);
        PasswordResetOtp::create(['user_id' => $this->user->id, 'channel' => 'sms', 'code_hash' => Hash::make('654321'),
            'expires_at' => now()->addMinutes(10), 'verified_at' => now(), 'reset_token' => hash('sha256', $second), 'reset_token_expires_at' => now()->addMinutes(15)]);
        $this->reset($first)->assertOk();
        $this->reset($second)->assertUnprocessable();
    }

    public function test_failed_recovery_audit_write_rolls_back_password_token_consumption_and_session_expiry(): void
    {
        $token = $this->token();
        $before = $this->user->password;
        $session = $this->user->createToken('synthetic-session')->accessToken;
        ActivityLog::creating(fn () => throw new \RuntimeException('Synthetic audit failure'));
        try {
            $this->reset($token)->assertStatus(500);
        } finally {
            ActivityLog::flushEventListeners();
        }
        $this->assertSame($before, $this->user->fresh()->password);
        $this->assertNull(PasswordResetOtp::where('reset_token', hash('sha256', $token))->firstOrFail()->consumed_at);
        $this->assertNull($session->fresh()->expires_at);
    }

    public function test_expired_token_and_bad_code_do_not_change_password(): void
    {
        $token = $this->token();
        PasswordResetOtp::where('user_id', $this->user->id)->update(['reset_token_expires_at' => now()->subSecond()]);
        $this->reset($token)->assertUnprocessable();
        $this->assertTrue(Hash::check('Old!pass123', $this->user->fresh()->password));
    }

    public function test_login_and_otp_endpoints_reject_excessive_attempts(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['login' => $this->user->email, 'password' => 'invalid'])->assertUnauthorized();
        }
        $this->postJson('/api/login', ['login' => $this->user->email, 'password' => 'invalid'])->assertStatus(429)->assertHeader('Retry-After');
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/password/otp/verify', ['login' => $this->user->email, 'channel' => 'email', 'code' => '999999'])->assertUnprocessable();
        }
        $this->postJson('/api/password/otp/verify', ['login' => $this->user->email, 'channel' => 'email', 'code' => '999999'])->assertStatus(429);
    }

    public function test_otp_send_limit_applies_without_disclosing_account_existence(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/password/otp/request', ['login' => 'unknown@example.test', 'channel' => 'email'])->assertOk();
        }
        $this->postJson('/api/password/otp/request', ['login' => 'unknown@example.test', 'channel' => 'email'])->assertStatus(429);
        Mail::assertNothingSent();
    }

    public function test_sms_delivery_does_not_store_the_otp_in_admin_visible_logs(): void
    {
        Http::fake(['*' => Http::response(['message' => ['status' => 'pending', 'reference_id' => 'synthetic']], 201)]);
        $this->postJson('/api/password/otp/request', ['login' => $this->user->mobile_number, 'channel' => 'sms'])->assertOk();
        $log = SmsLog::where('user_id', $this->user->id)->latest('id')->firstOrFail();
        $this->assertSame('Password reset verification code sent. [code redacted]', $log->message);
        Http::assertSentCount(1);
    }

    public function test_malformed_identity_is_validation_error_instead_of_limiter_server_error(): void
    {
        $this->postJson('/api/login', ['login' => ['invalid'], 'password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/password/otp/request', ['login' => ['invalid'], 'channel' => 'email'])->assertUnprocessable();
    }

    public function test_legacy_credential_sms_callers_are_redacted_without_changing_sensor_messages(): void
    {
        Http::fake(['*' => Http::response(['message' => ['status' => 'pending', 'reference_id' => 'synthetic']], 201)]);
        $service = app(SmsService::class);
        foreach (['Account Creation', 'Password Reset'] as $type) {
            $service->send($this->user->mobile_number, 'SYNTHETIC-CREDENTIAL', $type, $this->user->id);
            $this->assertSame('Account credential notification sent. [credential redacted]', SmsLog::latest('id')->firstOrFail()->message);
        }
        $service->send($this->user->mobile_number, 'Synthetic sensor alert', 'Sensor Alert', $this->user->id);
        $this->assertSame('Synthetic sensor alert', SmsLog::latest('id')->firstOrFail()->message);
    }

    public function test_first_login_exception_does_not_bypass_current_password_for_regular_accounts(): void
    {
        $this->actingAs($this->user, 'sanctum');
        $payload = ['new_password' => 'New!pass123', 'new_password_confirmation' => 'New!pass123'];
        $this->postJson('/api/change-password', $payload)->assertUnprocessable();
        $this->postJson('/api/change-password', $payload + ['current_password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/change-password', $payload + ['current_password' => 'Old!pass123'])->assertOk();
        $this->user->update(['must_change_password' => true]);
        $this->postJson('/api/change-password', $payload)->assertUnauthorized()->assertJsonPath('code', 'PASSWORD_REAUTHENTICATION_REQUIRED');
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $token = $this->postJson('/api/login', ['login' => $this->user->email, 'password' => 'New!pass123'])->assertOk()->json('token');
        $this->app['auth']->forgetGuards();
        $this->withToken($token);
        $this->postJson('/api/change-password', $payload)->assertOk();
    }

    public function test_settings_cannot_escalate_role_or_expose_password_fields(): void
    {
        $this->actingAs($this->user, 'sanctum')->putJson('/api/settings/profile', [
            'first_name' => 'Updated', 'last_name' => 'Fixture', 'mobile_number' => $this->user->mobile_number,
            'role' => 'super_admin', 'status' => 'inactive', 'password' => 'injected',
        ])->assertOk()->assertJsonMissingPath('data.password')->assertJsonMissingPath('data.remember_token');
        $this->assertSame('farm_owner', $this->user->fresh()->role);
        $this->assertSame('active', $this->user->fresh()->status);
        $this->assertTrue(Hash::check('Old!pass123', $this->user->fresh()->password));
    }

    public function test_farmer_password_resend_never_exposes_credentials_even_when_delivery_fails(): void
    {
        $staff = User::where('role', 'admin')->firstOrFail();
        Http::fake(['*' => Http::response(['message' => ['status' => 'rejected']], 400)]);
        $response = $this->actingAs($staff, 'sanctum')->postJson('/api/admin/farms/'.$this->user->id.'/resend-sms')
            ->assertStatus(502)->assertJsonMissingPath('temp_password');
        $fresh = $this->user->fresh();
        foreach ($response->json() as $value) {
            if (is_string($value)) {
                $this->assertFalse(Hash::check($value, $fresh->password), 'Credential must not appear in response.');
            }
        }
        $this->assertSame('Account credential notification sent. [credential redacted]', SmsLog::where('user_id', $fresh->id)->latest('id')->firstOrFail()->message);
        $this->actingAs($this->user, 'sanctum')->postJson('/api/admin/farms/'.$this->user->id.'/resend-sms')->assertForbidden();
    }

    public function test_oversized_profile_fields_fail_validation_before_persistence(): void
    {
        $before = hash('sha256', json_encode($this->user->fresh()->getAttributes()));
        $this->actingAs($this->user, 'sanctum')->putJson('/api/settings/profile', [
            'first_name' => str_repeat('A', 256), 'last_name' => str_repeat('B', 256), 'mobile_number' => $this->user->mobile_number,
        ])->assertUnprocessable()->assertJsonValidationErrors(['first_name', 'last_name']);
        $this->assertSame($before, hash('sha256', json_encode($this->user->fresh()->getAttributes())));
    }
}
