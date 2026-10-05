<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Super Admin -> Manage Accounts -> Add Account.
 *
 * The regression this guards: users.mobile_number was NOT NULL while the
 * controller wrote NULL into it for email-only accounts, so creating any
 * Admin or Vet account by email failed with SQLSTATE 1048 and the SPA showed
 * only "Server Error".
 *
 * Same MySQL-only caveat as the other feature tests; run with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AccountCreationTest
 */
class AccountCreationTest extends TestCase
{
    use DatabaseTransactions;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=AccountCreationTest');
        }

        Http::fake();
        Mail::fake();

        $this->superAdmin = User::where('role', 'super_admin')->firstOrFail();
    }

    private function uniqueEmail(): string
    {
        return 'acct'.Str::random(8).'@example.com';
    }

    private function uniqueMobile(): string
    {
        do {
            $mobile = '09'.random_int(100000000, 999999999);
        } while (User::where('mobile_number', $mobile)->exists());

        return $mobile;
    }

    private function create(array $payload)
    {
        return $this->actingAs($this->superAdmin)->postJson('/api/superadmin/accounts', $payload);
    }

    public function test_email_only_account_is_created_and_appears_in_the_list(): void
    {
        $email = $this->uniqueEmail();

        $response = $this->create([
            'role'           => 'vet',
            'full_name'      => 'Maria Santos',
            'email'          => $email,
            'contact_number' => '',
        ])->assertOk();

        $this->assertTrue($response->json('success'));
        $this->assertStringContainsString('created successfully', $response->json('message'));

        $account = User::where('email', $email)->first();
        $this->assertNotNull($account, 'email-only account was not saved');
        $this->assertSame('vet', $account->role);
        $this->assertSame('active', $account->status);
        $this->assertNull($account->mobile_number);
        $this->assertTrue((bool) $account->must_change_password);

        $listed = $this->actingAs($this->superAdmin)->getJson('/api/superadmin/accounts')->assertOk();
        $this->assertStringContainsString($email, $listed->getContent());
    }

    public function test_mobile_only_account_is_created(): void
    {
        $mobile = $this->uniqueMobile();

        $this->create([
            'role'           => 'admin',
            'full_name'      => 'Jose Cruz',
            'email'          => '',
            'contact_number' => $mobile,
        ])->assertOk();

        $account = User::where('mobile_number', $mobile)->firstOrFail();
        $this->assertNull($account->email);
        $this->assertSame('admin', $account->role);
    }

    public function test_both_channels_are_kept_when_both_are_given(): void
    {
        $email  = $this->uniqueEmail();
        $mobile = $this->uniqueMobile();

        $this->create([
            'role'           => 'admin',
            'full_name'      => 'Ana Reyes',
            'email'          => $email,
            'contact_number' => $mobile,
        ])->assertOk();

        $account = User::where('email', $email)->firstOrFail();

        // The number used to be discarded whenever an email was present.
        $this->assertSame($mobile, $account->mobile_number);
    }

    public function test_created_account_can_log_in_with_its_temporary_password(): void
    {
        $email = $this->uniqueEmail();

        $this->create([
            'role'           => 'vet',
            'full_name'      => 'Luis Garcia',
            'email'          => $email,
            'contact_number' => '',
        ])->assertOk();

        // The temp password is random and never returned, so it is reset here
        // to a known value. What is being proven is that the stored row can
        // authenticate at all — correct role, active status, usable hash.
        $account = User::where('email', $email)->firstOrFail();
        $account->update(['password' => bcrypt('Kn0wn!pass')]);

        $this->app['auth']->forgetGuards();

        $login = $this->postJson('/api/login', ['login' => $email, 'password' => 'Kn0wn!pass'])
            ->assertOk()
            ->assertJsonPath('user.role', 'vet')
            ->assertJsonStructure(['token']);

        // Compared loosely: the column is not cast to bool on the model, so
        // the API returns 1 rather than true. The frontend reads it as truthy
        // to send first-time users to /change-password, which is what matters.
        $this->assertTrue((bool) $login->json('user.must_change_password'));
    }

    public function test_duplicate_email_is_rejected_per_field_and_creates_nothing(): void
    {
        $email = $this->uniqueEmail();

        $this->create([
            'role' => 'admin', 'full_name' => 'First Owner',
            'email' => $email, 'contact_number' => '',
        ])->assertOk();

        $before = User::count();

        $this->create([
            'role' => 'vet', 'full_name' => 'Second Owner',
            'email' => $email, 'contact_number' => '',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');

        $this->assertSame($before, User::count(), 'a duplicate submission still wrote a row');
    }

    public function test_duplicate_mobile_is_rejected_per_field(): void
    {
        $mobile = $this->uniqueMobile();

        $this->create([
            'role' => 'admin', 'full_name' => 'First Owner',
            'email' => '', 'contact_number' => $mobile,
        ])->assertOk();

        $this->create([
            'role' => 'vet', 'full_name' => 'Second Owner',
            'email' => '', 'contact_number' => $mobile,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('contact_number');
    }

    public function test_missing_name_and_missing_contact_are_rejected(): void
    {
        $this->create(['role' => 'admin', 'full_name' => '', 'email' => '', 'contact_number' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('full_name');

        $this->create(['role' => 'admin', 'full_name' => 'No Contact', 'email' => '', 'contact_number' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_invalid_formats_are_rejected_on_the_right_fields(): void
    {
        $this->create([
            'role' => 'admin', 'full_name' => 'Bad Email',
            'email' => 'not-an-email', 'contact_number' => '',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');

        $this->create([
            'role' => 'admin', 'full_name' => 'Bad Mobile',
            'email' => '', 'contact_number' => '12345',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('contact_number');
    }

    public function test_both_bad_fields_are_reported_in_one_response(): void
    {
        $this->create([
            'role' => 'admin', 'full_name' => 'Both Bad',
            'email' => 'nope', 'contact_number' => '12345',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'contact_number']);
    }

    public function test_invalid_role_is_rejected(): void
    {
        $this->create([
            'role' => 'super_admin', 'full_name' => 'Escalation Attempt',
            'email' => $this->uniqueEmail(), 'contact_number' => '',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');
    }

    public function test_legacy_single_contact_field_still_works(): void
    {
        $email = $this->uniqueEmail();

        $this->create(['role' => 'admin', 'full_name' => 'Legacy Shape', 'contact' => $email])
            ->assertOk();

        $this->assertNotNull(User::where('email', $email)->first());
    }

    public function test_non_super_admin_cannot_create_accounts(): void
    {
        $admin = User::where('role', 'admin')->firstOrFail();

        $this->actingAs($admin)
            ->postJson('/api/superadmin/accounts', [
                'role' => 'vet', 'full_name' => 'Nope',
                'email' => $this->uniqueEmail(), 'contact_number' => '',
            ])
            ->assertStatus(403);
    }
}
