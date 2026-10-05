<?php

namespace Tests\Feature;

use App\Mail\TempPasswordMail;
use App\Models\ActivityLog;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Super Admin -> Account Details -> Reset Password.
 *
 * The regression this guards: the endpoint returned the temporary password in
 * its JSON and the SPA printed it in a modal, which was the only way the
 * account holder ever learned it — nothing was actually sent.
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AccountPasswordResetTest
 */
class AccountPasswordResetTest extends TestCase
{
    use DatabaseTransactions;

    private const OLD_PASSWORD = 'Old!pass123';

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AccountPasswordResetTest');
        }

        Mail::fake();

        // Not Http::fake() here: a catch-all registered in setUp wins over the
        // per-test stubs below (the first matching callback is used), so every
        // SMS test would silently see an empty 200 and read it as a failure.
        // Each SMS test declares its own response; this makes any request that
        // is not faked blow up instead of reaching the network.
        Http::preventStrayRequests();

        $this->superAdmin = User::where('role', 'super_admin')->firstOrFail();
    }

    private function account(array $overrides = []): User
    {
        do {
            $mobile = '09'.random_int(100000000, 999999999);
        } while (User::where('mobile_number', $mobile)->exists());

        return User::create(array_merge([
            'first_name'    => 'Reset',
            'last_name'     => Str::random(6),
            'email'         => 'reset'.Str::random(8).'@example.com',
            'mobile_number' => $mobile,
            'password'      => bcrypt(self::OLD_PASSWORD),
            'role'          => 'vet',
            'status'        => 'active',
        ], $overrides));
    }

    private function reset(User $account)
    {
        return $this->actingAs($this->superAdmin)
            ->postJson("/api/superadmin/accounts/{$account->id}/reset-password");
    }

    public function test_response_never_carries_the_temporary_password(): void
    {
        $account = $this->account();

        $response = $this->reset($account)->assertOk();

        $this->assertNull($response->json('temp_password'));

        // The new password must not appear anywhere in the body under any key.
        $fresh = $account->fresh();
        $body  = $response->getContent();

        foreach ($response->json() as $key => $value) {
            if (is_string($value)) {
                $this->assertFalse(
                    Hash::check($value, $fresh->password),
                    "response field '{$key}' contains the temporary password"
                );
            }
        }

        $this->assertStringContainsString('has been sent', $body);
    }

    public function test_account_with_an_email_is_sent_the_password_by_email(): void
    {
        $account = $this->account();

        $this->reset($account)->assertOk();

        Mail::assertSent(TempPasswordMail::class, function ($mail) use ($account) {
            return $mail->hasTo($account->email);
        });
    }

    public function test_account_with_only_a_mobile_number_is_sent_an_sms(): void
    {
        $account = $this->account(['email' => null]);

        // UniSMS accepts with status "pending"; Http::fake() returns an empty
        // 200 by default, which the service correctly reads as a failure.
        Http::fake(['*' => Http::response(['message' => ['status' => 'pending', 'reference_id' => 'TEST']], 201)]);

        $this->reset($account)->assertOk();

        $log = SmsLog::where('user_id', $account->id)->latest('id')->firstOrFail();
        $this->assertSame('Sent', $log->status);
        $this->assertSame('Password Reset', $log->type);
    }

    public function test_sms_log_does_not_store_the_temporary_password(): void
    {
        $account = $this->account(['email' => null]);

        Http::fake(['*' => Http::response(['message' => ['status' => 'pending', 'reference_id' => 'TEST']], 201)]);

        $this->reset($account)->assertOk();

        $log   = SmsLog::where('user_id', $account->id)->latest('id')->firstOrFail();
        $fresh = $account->fresh();

        // The stored line must not be the real message: that one carries a live
        // credential and sms_logs is readable from the admin views.
        $this->assertStringNotContainsString('Your temporary password:', $log->message);

        foreach (preg_split('/\s+/', (string) $log->message) as $word) {
            $word = trim($word, " \t\n\r.,:;—");

            if ($word !== '') {
                $this->assertFalse(Hash::check($word, $fresh->password), 'sms_logs stored the temporary password');
            }
        }
    }

    public function test_old_password_stops_working_and_the_account_must_change_it(): void
    {
        $account = $this->account();

        $this->reset($account)->assertOk();

        $fresh = $account->fresh();

        $this->assertFalse(Hash::check(self::OLD_PASSWORD, $fresh->password));
        $this->assertTrue((bool) $fresh->must_change_password);

        $this->app['auth']->forgetGuards();

        $this->postJson('/api/login', ['login' => $account->email, 'password' => self::OLD_PASSWORD])
            ->assertStatus(401);
    }

    public function test_the_issued_password_can_actually_log_in(): void
    {
        $account = $this->account();

        // The password is never exposed, so it is captured from the Mailable —
        // the same value the account holder receives.
        $this->reset($account)->assertOk();

        $sent = null;
        Mail::assertSent(TempPasswordMail::class, function ($mail) use (&$sent) {
            $sent = $mail->tempPassword;
            return true;
        });

        $this->assertNotNull($sent);
        $this->app['auth']->forgetGuards();

        $this->postJson('/api/login', ['login' => $account->email, 'password' => $sent])
            ->assertOk()
            ->assertJsonStructure(['token']);
    }

    public function test_account_without_any_contact_is_rejected_and_keeps_its_password(): void
    {
        // Built directly so the "no contact at all" state can be reached even
        // though the create form requires one.
        $account = $this->account(['email' => null]);
        $account->forceFill(['mobile_number' => null])->save();

        $this->reset($account)
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        // Rejected BEFORE the password was touched — otherwise the account
        // would be locked out with no channel to recover through.
        $this->assertTrue(Hash::check(self::OLD_PASSWORD, $account->fresh()->password));
    }

    public function test_failed_delivery_is_reported_as_a_failure_not_a_success(): void
    {
        $account = $this->account(['email' => null]);

        // UniSMS reachable but refusing the message.
        Http::fake(['*' => Http::response(['message' => ['status' => 'failed', 'fail_reason' => 'no credits']], 200)]);

        $response = $this->reset($account)->assertStatus(502);

        $this->assertFalse($response->json('success'));
        $this->assertNull($response->json('temp_password'));

        $log = ActivityLog::where('action', 'like', 'Reset%Password')->latest('id')->firstOrFail();
        $this->assertStringContainsString('FAILED', $log->details);
    }

    public function test_activity_log_records_the_reset_without_the_password(): void
    {
        $account = $this->account();

        $this->reset($account)->assertOk();

        $log   = ActivityLog::where('action', 'like', 'Reset%Password')->latest('id')->firstOrFail();
        $fresh = $account->fresh();

        $this->assertStringContainsString($account->first_name, $log->details);

        foreach (preg_split('/\s+/', (string) $log->details) as $word) {
            $word = trim($word, " \t\n\r.,:;—");

            if ($word !== '') {
                $this->assertFalse(Hash::check($word, $fresh->password), 'activity log stored the temporary password');
            }
        }
    }

    public function test_only_super_admin_can_reset(): void
    {
        $account = $this->account();
        $admin   = User::where('role', 'admin')->firstOrFail();

        $this->actingAs($admin)
            ->postJson("/api/superadmin/accounts/{$account->id}/reset-password")
            ->assertStatus(403);

        $this->assertTrue(Hash::check(self::OLD_PASSWORD, $account->fresh()->password));
    }
}
