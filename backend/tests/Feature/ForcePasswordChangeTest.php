<?php

namespace Tests\Feature;

use App\Http\Controllers\AuthController;
use App\Mail\OtpCodeMail;
use App\Mail\TempPasswordMail;
use App\Models\PasswordResetOtp;
use App\Models\User;
use Closure;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\InputStream;
use Symfony\Component\Process\Process;
use Tests\Support\Phase104Database;
use Tests\TestCase;

class ForcePasswordChangeTest extends TestCase
{
    private ?string $nativeSchema = null;

    public function createApplication()
    {
        if (is_file(dirname(__DIR__, 2).'/bootstrap/cache/config.php')
            || (getenv('APP_CONFIG_CACHE') && is_file(getenv('APP_CONFIG_CACHE')))) {
            throw new \RuntimeException('Security tests refuse cached application configuration.');
        }
        $environment = ['APP_ENV' => 'testing', 'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => ':memory:',
            'DB_URL' => '', 'DB_SOCKET' => '', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array',
            'QUEUE_CONNECTION' => 'sync', 'MAIL_MAILER' => 'array', 'LOG_CHANNEL' => 'null', 'BCRYPT_ROUNDS' => '4'];
        if (getenv('PASSWORD_SECURITY_MYSQL') === '1') {
            // This existing helper verifies loopback, port, server version,
            // and a private temporary data directory before any schema write.
            $settings = Phase104Database::settings();
            $connection = Phase104Database::connect();
            $this->nativeSchema = 'agribantay_phase4_test_'.bin2hex(random_bytes(6));
            $connection->exec('CREATE DATABASE `'.$this->nativeSchema.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            $environment = array_replace($environment, ['DB_CONNECTION' => 'mysql', 'DB_DATABASE' => $this->nativeSchema,
                'DB_HOST' => '127.0.0.1', 'DB_PORT' => '3307', 'DB_USERNAME' => $settings['username'], 'DB_PASSWORD' => $settings['password']]);
        }
        foreach ($environment as $key => $value) {
            putenv($key.'='.$value);
            $_ENV[$key] = $_SERVER[$key] = $value;
        }

        return parent::createApplication();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame($this->nativeSchema ? 'mysql' : 'sqlite', DB::connection()->getDriverName());
        $this->assertSame($this->nativeSchema ?? ':memory:', DB::connection()->getDatabaseName());
        if ($this->nativeSchema) {
            $this->assertSame('127.0.0.1', DB::connection()->getConfig('host'));
            $this->assertSame('3307', (string) DB::connection()->getConfig('port'));
        }
        Http::preventStrayRequests();
        Mail::fake();
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            foreach (['first_name', 'last_name', 'email', 'mobile_number', 'password', 'role', 'status', 'address', 'profile_photo_path'] as $name) {
                $table->string($name)->nullable();
            }
            $table->boolean('must_change_password')->default(false);
            $table->timestamp('legal_acknowledged_at')->nullable();
            $table->timestamps();
        });
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            foreach (['role', 'action', 'details', 'type'] as $field) $table->text($field)->nullable();
            $table->timestamps();
        });
        Schema::create('password_reset_otps', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            foreach (['channel', 'code_hash', 'reset_token'] as $field) $table->string($field)->nullable();
            foreach (['expires_at', 'verified_at', 'consumed_at', 'reset_token_expires_at'] as $field) $table->timestamp($field)->nullable();
            $table->timestamps();
        });
        Schema::create('sms_logs', function (Blueprint $table) {
            $table->id();
            foreach (['user_id', 'farm_id'] as $field) $table->unsignedBigInteger($field)->nullable();
            foreach (['phone_number', 'message', 'type', 'status', 'message_id', 'failure_reason', 'sms_alert_token'] as $field) $table->text($field)->nullable();
            $table->timestamps();
        });
        foreach (['farm_owner', 'admin', 'super_admin', 'vet'] as $role) {
            Route::get('/api/security-test/'.$role, fn () => ['allowed' => true])
                ->middleware(['auth:sanctum', 'active', 'password.changed', 'role:'.$role]);
        }
    }

    protected function tearDown(): void
    {
        try {
            parent::tearDown();
        } finally {
            if ($this->nativeSchema) {
                // Only this test's randomly named, newly created schema.
                Phase104Database::connect($this->nativeSchema)->exec('DROP DATABASE `'.$this->nativeSchema.'`');
            }
        }
    }

    public static function sessions(): array
    {
        $cases = [];
        foreach (['farm_owner', 'admin', 'super_admin', 'vet'] as $role) {
            foreach ([false, true] as $remember) $cases[$role.($remember ? ' remembered' : ' unremembered')] = [$role, $remember];
        }

        return $cases;
    }

    private function user(string $role = 'admin', bool $forced = true): User
    {
        $number = User::count() + 1;

        return User::create(['first_name' => 'Synthetic', 'last_name' => 'Security', 'role' => $role,
            'status' => 'active', 'email' => 'security'.$number.'@example.test', 'mobile_number' => '0917'.str_pad((string) $number, 7, '0', STR_PAD_LEFT),
            'password' => Hash::make('Temporary!123'), 'must_change_password' => $forced]);
    }

    private function bearer(string $token): static
    {
        $this->app['auth']->forgetGuards();
        return $this->withToken($token);
    }

    private function login(User $user, bool $remember = false, string $password = 'Temporary!123'): string
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $response = $this->postJson('/api/login', ['login' => $user->email, 'password' => $password, 'remember' => $remember,
            'name' => 'frontend-purpose', 'abilities' => ['frontend-purpose'], 'must_change_password' => false])->assertOk();
        $this->assertSame($user->role, $response->json('user.role'));
        return $response->json('token');
    }

    private function payload(): array
    {
        return ['new_password' => 'Permanent!456', 'new_password_confirmation' => 'Permanent!456'];
    }

    #[DataProvider('sessions')]
    public function test_legacy_and_new_tokens_enforce_the_complete_lifecycle(string $role, bool $remember): void
    {
        $this->travelTo(now()->startOfSecond());
        $user = $this->user($role);
        $legacy = $user->createToken('auth_token')->plainTextToken;
        $unrelated = $this->user('vet', false)->createToken('unrelated')->plainTextToken;
        $originalHash = $user->password;
        $this->bearer($legacy)->getJson('/api/me')->assertOk()->assertJsonPath('must_change_password', true)->assertJsonPath('requires_fresh_login', true);
        $this->bearer($legacy)->head('/api/me', ['Accept' => 'application/json'])->assertOk();
        foreach ([['GET', '/api/settings'], ['GET', '/api/notifications'], ['PUT', '/api/settings/profile'], ['POST', '/api/acknowledge-legal'], ['GET', '/api/security-test/'.$role]] as [$method, $url]) {
            $this->bearer($legacy)->json($method, $url)->assertForbidden()->assertJsonPath('code', 'PASSWORD_CHANGE_REQUIRED');
        }
        $this->bearer($legacy)->postJson('/api/change-password', $this->payload() + [
            'current_password' => 'Temporary!123', 'name' => $user->passwordChangeTokenName(), 'requires_fresh_login' => false,
        ])->assertUnauthorized()->assertJsonPath('code', 'PASSWORD_REAUTHENTICATION_REQUIRED');
        $this->assertSame($originalHash, $user->fresh()->password);
        $this->assertNotNull(PersonalAccessToken::findToken($legacy), 'No legacy cleanup occurs on rejection.');

        $loggedOut = $this->login($user, $remember);
        $this->bearer($loggedOut)->postJson('/api/logout')->assertOk();
        $this->assertNull(PersonalAccessToken::findToken($loggedOut));
        $this->assertTrue($user->fresh()->must_change_password);

        $token = $this->login($user, $remember);
        $before = PersonalAccessToken::findToken($token);
        $this->assertSame($user->passwordChangeTokenName(), $before->name);
        $this->assertSame(['*'], $before->abilities);
        $this->assertTrue($before->expires_at->equalTo($remember ? now()->addDays(30) : now()->addHours(12)));
        $this->bearer($token)->getJson('/api/me')->assertOk()->assertJsonPath('requires_fresh_login', false);
        $this->bearer($token)->postJson('/api/change-password', $this->payload())->assertOk()->assertJsonPath('user.must_change_password', false);
        $after = PersonalAccessToken::findToken($token);
        $this->assertSame($before->id, $after->id);
        $this->assertSame($before->name, $after->name);
        $this->assertTrue($before->expires_at->equalTo($after->expires_at));
        $this->assertNull(PersonalAccessToken::findToken($legacy));
        $this->assertNotNull(PersonalAccessToken::findToken($unrelated));
        $this->assertTrue(Hash::check('Permanent!456', $user->fresh()->password));
        $this->bearer($token)->getJson('/api/security-test/'.$role)->assertOk();
        $this->bearer($token)->getJson('/api/me')->assertOk()->assertJsonPath('requires_fresh_login', false);
        $this->bearer($token)->postJson('/api/logout')->assertOk();
        $this->bearer($token)->getJson('/api/me')->assertUnauthorized();
        $this->assertNotNull(PersonalAccessToken::findToken($unrelated));
    }

    #[DataProvider('sessions')]
    public function test_regular_accounts_keep_password_verification_permissions_and_other_sessions(string $role, bool $remember): void
    {
        $user = $this->user($role, false);
        $other = $user->createToken('another-session')->plainTextToken;
        $token = $this->login($user, $remember);
        $this->assertSame('auth_token', PersonalAccessToken::findToken($token)->name);
        $this->bearer($token)->getJson('/api/security-test/'.$role)->assertOk();
        $wrongRole = $role === 'vet' ? 'farm_owner' : 'vet';
        $this->bearer($token)->getJson('/api/security-test/'.$wrongRole)->assertForbidden()->assertJsonMissingPath('code');
        $this->bearer($token)->postJson('/api/change-password', $this->payload())->assertUnprocessable();
        $this->bearer($token)->postJson('/api/change-password', $this->payload() + ['current_password' => 'wrong'])->assertUnprocessable();
        $this->bearer($token)->postJson('/api/change-password', $this->payload() + ['current_password' => 'Temporary!123'])->assertOk();
        $this->assertNotNull(PersonalAccessToken::findToken($other));
    }

    public function test_allowlist_covers_all_authenticated_production_routes_and_preserves_role_rules(): void
    {
        $names = [];
        foreach (Route::getRoutes() as $route) {
            $middleware = $route->gatherMiddleware();
            if (! in_array('auth:sanctum', $middleware, true)) continue;
            $this->assertLessThan(array_search('active', $middleware), array_search('auth:sanctum', $middleware));
            $this->assertLessThan(array_search('password.changed', $middleware), array_search('active', $middleware));
            foreach ($middleware as $item) {
                if (str_starts_with($item, 'role:')) $this->assertLessThan(array_search($item, $middleware), array_search('password.changed', $middleware));
            }
            if (str_starts_with((string) $route->getName(), 'auth.')) $names[$route->getName()] = [$route->uri(), $route->methods()];
        }
        $this->assertSame(['api/logout', ['POST']], $names['auth.logout']);
        $this->assertSame(['api/me', ['GET', 'HEAD']], $names['auth.me']);
        $this->assertSame(['api/change-password', ['POST']], $names['auth.change-password']);
        $this->assertCount(3, $names);
        $super = $this->user('super_admin', false);
        $token = $this->login($super);
        $this->bearer($token)->getJson('/api/superadmin/accounts')->assertOk();
        $middleware = Route::getRoutes()->match(Request::create('/api/admin/dashboard'))->gatherMiddleware();
        $this->assertContains('role:admin,super_admin', $middleware);
    }

    public function test_flagged_legacy_logout_and_invalid_expired_inactive_tokens_are_safe(): void
    {
        $user = $this->user();
        $legacy = $user->createToken('auth_token')->plainTextToken;
        $this->bearer($legacy)->postJson('/api/logout')->assertOk();
        $this->assertNull(PersonalAccessToken::findToken($legacy));
        $expired = $user->createToken($user->passwordChangeTokenName(), ['*'], now()->subMinute())->plainTextToken;
        foreach ([$expired, '999999|'.str_repeat('x', 40)] as $bad) $this->bearer($bad)->postJson('/api/change-password', $this->payload())->assertUnauthorized();
        $token = $this->login($user);
        $user->update(['status' => 'inactive']);
        $this->bearer($token)->getJson('/api/me')->assertUnauthorized();
        $this->assertNull(PersonalAccessToken::findToken($token));
    }

    public function test_failed_validation_preserves_the_flag_password_and_tokens(): void
    {
        $user = $this->user();
        $token = $this->login($user);
        $other = $user->createToken('other')->plainTextToken;
        $hash = $user->password;
        $this->bearer($token)->postJson('/api/change-password', ['new_password' => 'weak', 'new_password_confirmation' => 'weak'])->assertUnprocessable();
        $this->bearer($token)->postJson('/api/change-password', ['new_password' => 'Permanent!456', 'new_password_confirmation' => 'different'])->assertUnprocessable();
        $this->assertTrue($user->fresh()->must_change_password);
        $this->assertSame($hash, $user->fresh()->password);
        $this->assertNotNull(PersonalAccessToken::findToken($other));
    }

    public static function resets(): array
    {
        return [['admin', 'farm_owner'], ['super_admin', 'farm_owner'], ['super_admin', 'admin'], ['super_admin', 'vet']];
    }

    #[DataProvider('resets')]
    public function test_administrative_reissue_revokes_only_target_tokens(string $actorRole, string $targetRole): void
    {
        $actor = $this->user($actorRole, false);
        $actorToken = $this->login($actor);
        $target = $this->user($targetRole, false);
        $old = $target->createToken('auth_token')->plainTextToken;
        $second = $target->createToken($target->passwordChangeTokenName())->plainTextToken;
        $unrelated = $this->user('vet', false)->createToken('unrelated')->plainTextToken;
        $smsPassword = null;
        Http::fake(function ($request) use (&$smsPassword) {
            preg_match('/temporary password: ([^.]+)\./', $request['content'], $matches);
            $smsPassword = $matches[1] ?? null;
            return Http::response(['message' => ['status' => 'pending', 'reference_id' => 'synthetic']], 200);
        });
        $url = $targetRole === 'farm_owner' ? '/api/admin/farms/'.$target->id.'/resend-sms' : '/api/superadmin/accounts/'.$target->id.'/reset-password';
        $this->bearer($actorToken)->postJson($url)->assertOk()->assertJsonMissingPath('temp_password');
        $this->assertNull(PersonalAccessToken::findToken($old));
        $this->assertNull(PersonalAccessToken::findToken($second));
        $this->assertNotNull(PersonalAccessToken::findToken($actorToken));
        $this->assertNotNull(PersonalAccessToken::findToken($unrelated));
        $password = $targetRole === 'farm_owner' ? $smsPassword : Mail::sent(TempPasswordMail::class)->last()->tempPassword;
        $this->assertTrue(Hash::check($password, $target->fresh()->password));
        $this->assertTrue($target->fresh()->must_change_password);
        $this->bearer($old)->postJson('/api/change-password', $this->payload())->assertUnauthorized();
        $fresh = $this->login($target, true, $password);
        $this->bearer($fresh)->postJson('/api/change-password', $this->payload())->assertOk();
    }

    public function test_reset_with_no_contact_changes_nothing_and_wrong_roles_stay_forbidden(): void
    {
        $actor = $this->user('super_admin', false);
        $token = $this->login($actor);
        $target = $this->user('vet', false);
        $target->update(['email' => null, 'mobile_number' => null]);
        $old = $target->createToken('auth_token')->plainTextToken;
        $hash = $target->password;
        $this->bearer($token)->postJson('/api/superadmin/accounts/'.$target->id.'/reset-password')->assertUnprocessable();
        $this->assertSame($hash, $target->fresh()->password);
        $this->assertNotNull(PersonalAccessToken::findToken($old));
        $admin = $this->user('admin', false);
        $this->bearer($this->login($admin))->postJson('/api/superadmin/accounts/'.$target->id.'/reset-password')->assertForbidden();
    }

    public function test_failed_delivery_is_honest_but_does_not_restore_old_sessions(): void
    {
        $actor = $this->user('admin', false);
        $target = $this->user('farm_owner', false);
        $old = $target->createToken('auth_token')->plainTextToken;
        Http::fake(['*' => Http::response([], 400)]);
        $this->bearer($this->login($actor))->postJson('/api/admin/farms/'.$target->id.'/resend-sms')->assertStatus(502)->assertJsonMissingPath('temp_password');
        $this->assertNull(PersonalAccessToken::findToken($old));
        $this->assertTrue($target->fresh()->must_change_password);
        $this->assertStringNotContainsString('temporary password:', DB::table('sms_logs')->value('message'));
    }

    public function test_forced_change_and_reissue_roll_back_when_token_revocation_fails(): void
    {
        $user = $this->user('vet');
        $current = $this->login($user);
        $other = $user->createToken('other')->plainTextToken;
        $hash = $user->password;
        DB::unprepared($this->nativeSchema
            ? "CREATE TRIGGER fail_security_delete BEFORE DELETE ON personal_access_tokens FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic revocation failure'"
            : "CREATE TRIGGER fail_security_delete BEFORE DELETE ON personal_access_tokens BEGIN SELECT RAISE(ABORT, 'Synthetic revocation failure'); END");
        $this->bearer($current)->postJson('/api/change-password', $this->payload())->assertStatus(500);
        $this->assertSame($hash, $user->fresh()->password);
        $this->assertTrue($user->fresh()->must_change_password);
        $this->assertNotNull(PersonalAccessToken::findToken($other));
        $actor = $this->user('super_admin', false);
        $this->bearer($this->login($actor))->postJson('/api/superadmin/accounts/'.$user->id.'/reset-password')->assertStatus(500);
        $this->assertSame($hash, $user->fresh()->password);
        $this->assertNotNull(PersonalAccessToken::findToken($current));
    }

    public function test_reset_after_authentication_cannot_be_overwritten_by_an_inflight_change(): void
    {
        $user = $this->user();
        $token = $this->login($user);
        $this->app->instance('security.interleave', function () use ($user) {
            DB::transaction(function () use ($user) {
                $fresh = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                $fresh->update(['password' => Hash::make('Reset!789'), 'must_change_password' => true]);
                $fresh->tokens()->delete();
            });
        });
        Route::getRoutes()->getByName('auth.change-password')->middleware(InterleavePasswordChange::class);
        $this->bearer($token)->postJson('/api/change-password', $this->payload())->assertUnauthorized();
        $this->assertTrue(Hash::check('Reset!789', $user->fresh()->password));
        $this->assertTrue($user->fresh()->must_change_password);
    }

    public function test_settings_password_save_cannot_overwrite_a_reset_after_authentication(): void
    {
        $user = $this->user('admin', false);
        $token = $this->login($user);
        $this->app->instance('security.interleave', function () use ($user) {
            DB::transaction(function () use ($user) {
                $fresh = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                $fresh->update(['password' => Hash::make('Reset!789'), 'must_change_password' => true]);
                $fresh->tokens()->delete();
            });
        });
        Route::getRoutes()->match(Request::create('/api/settings/password', 'PUT'))->middleware(InterleavePasswordChange::class);
        $this->bearer($token)->putJson('/api/settings/password', $this->payload() + ['current_password' => 'Temporary!123'])->assertUnauthorized();
        $this->assertTrue(Hash::check('Reset!789', $user->fresh()->password));
        $this->assertTrue($user->fresh()->must_change_password);
    }

    public function test_regular_settings_password_change_keeps_existing_validation_and_sessions(): void
    {
        $user = $this->user('vet', false);
        $token = $this->login($user, true);
        $other = $user->createToken('another-browser')->plainTextToken;
        $this->bearer($token)->putJson('/api/settings/password', $this->payload() + ['current_password' => 'wrong'])->assertUnprocessable();
        $this->bearer($token)->putJson('/api/settings/password', $this->payload() + ['current_password' => 'Temporary!123'])->assertOk();
        $this->assertFalse($user->fresh()->must_change_password);
        $this->assertTrue(Hash::check('Permanent!456', $user->fresh()->password));
        $this->assertNotNull(PersonalAccessToken::findToken($token));
        $this->assertNotNull(PersonalAccessToken::findToken($other));
    }

    public function test_server_controls_purpose_and_rejects_an_obsolete_credential_marker(): void
    {
        $user = $this->user('vet', false);
        $this->postJson('/api/login', ['login' => $user->email, 'password' => 'Temporary!123',
            'must_change_password' => true, 'name' => $user->passwordChangeTokenName()])->assertOk()->assertJsonPath('user.must_change_password', false);
        $token = $this->login($user);
        $oldPurpose = $user->passwordChangeTokenName();
        // Even an already marked token cannot prove knowledge of a newer
        // credential. No cleanup is necessary to reject this obsolete marker.
        PersonalAccessToken::findToken($token)->update(['name' => $oldPurpose]);
        $user->update(['password' => Hash::make('Reset!789'), 'must_change_password' => true]);
        $this->bearer($token)->getJson('/api/me')->assertOk()->assertJsonPath('requires_fresh_login', true);
        $this->bearer($token)->postJson('/api/change-password', $this->payload())->assertUnauthorized()->assertJsonPath('code', 'PASSWORD_REAUTHENTICATION_REQUIRED');
        $this->assertTrue(Hash::check('Reset!789', $user->fresh()->password));
    }

    public static function creations(): array
    {
        return [['admin', 'email'], ['admin', 'sms'], ['vet', 'email'], ['vet', 'sms']];
    }

    #[DataProvider('creations')]
    public function test_account_creation_delivery_and_first_login_are_preserved(string $role, string $channel): void
    {
        $actor = $this->user('super_admin', false);
        $actorToken = $this->login($actor);
        $sent = null;
        Http::fake(function ($request) use (&$sent) {
            preg_match('/Temporary password: ([^.]+)\./', $request['content'], $matches);
            $sent = $matches[1] ?? null;
            return Http::response(['message' => ['status' => 'pending']], 200);
        });
        $payload = ['full_name' => 'Created Fixture', 'role' => $role,
            'email' => $channel === 'email' ? 'created@example.test' : '', 'contact_number' => $channel === 'sms' ? '09998887777' : ''];
        $response = $this->bearer($actorToken)->postJson('/api/superadmin/accounts', $payload)->assertOk()
            ->assertJsonPath('delivered', true)->assertJsonPath('data.must_change_password', true)->assertJsonMissingPath('data.password');
        $account = User::findOrFail($response->json('data.id'));
        $password = $channel === 'email' ? Mail::sent(TempPasswordMail::class)->last()->tempPassword : $sent;
        $this->assertTrue(Hash::check($password, $account->password));
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $login = $this->postJson('/api/login', ['login' => $account->email ?: $account->mobile_number, 'password' => $password])->assertOk();
        $token = $login->json('token');
        $this->assertSame($account->passwordChangeTokenName(), PersonalAccessToken::findToken($token)->name);
        $this->bearer($token)->getJson('/api/settings')->assertForbidden()->assertJsonPath('code', 'PASSWORD_CHANGE_REQUIRED');
        $this->bearer($actorToken)->postJson('/api/superadmin/accounts', $payload)->assertUnprocessable();
    }

    public function test_two_authenticated_changes_cannot_both_complete(): void
    {
        $user = $this->user();
        $first = $this->login($user);
        $second = $this->login($user, true);
        $this->app->instance('security.interleave', function () use ($user, $first) {
            $request = Request::create('/api/change-password', 'POST', ['new_password' => 'First!123', 'new_password_confirmation' => 'First!123']);
            $request->setUserResolver(fn () => $user->fresh()->withAccessToken(PersonalAccessToken::findToken($first)));
            $response = app(AuthController::class)->changePassword($request);
            $this->assertSame(200, $response->getStatusCode());
        });
        Route::getRoutes()->getByName('auth.change-password')->middleware(InterleavePasswordChange::class);
        $this->bearer($second)->postJson('/api/change-password', $this->payload())->assertUnauthorized();
        $this->assertTrue(Hash::check('First!123', $user->fresh()->password));
        $this->assertNotNull(PersonalAccessToken::findToken($first));
        $this->assertNull(PersonalAccessToken::findToken($second));
    }

    #[DataProvider('sessions')]
    public function test_verified_recovery_still_clears_the_flag_and_expires_all_sessions(string $role, bool $remember): void
    {
        $user = $this->user($role);
        $token = $this->login($user, $remember);
        $legacy = $user->createToken('auth_token')->plainTextToken;
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/password/otp/request', ['login' => $user->email, 'channel' => 'email'])->assertOk();
        $code = Mail::sent(OtpCodeMail::class)->last()->code;
        $verified = $this->postJson('/api/password/otp/verify', ['login' => $user->email, 'channel' => 'email', 'code' => $code])->assertOk();
        $payload = $this->payload() + ['reset_token' => $verified->json('reset_token')];
        $this->postJson('/api/password/reset', $payload)->assertOk();
        $this->assertFalse($user->fresh()->must_change_password);
        $this->assertTrue(Hash::check('Permanent!456', $user->fresh()->password));
        $this->assertNotNull(PasswordResetOtp::first()->consumed_at);
        $this->postJson('/api/password/reset', $payload)->assertUnprocessable();
        foreach ([$token, $legacy] as $old) $this->bearer($old)->getJson('/api/me')->assertUnauthorized();
    }

    private function worker(string $action, array $payload, ?string $token = null, bool $pause = false): Process
    {
        return new Process([PHP_BINARY, base_path('tests/Support/password-security-worker.php'),
            json_encode(compact('action', 'payload', 'token', 'pause'), JSON_THROW_ON_ERROR)], base_path(), null, null, 20);
    }

    private function workerResult(Process $worker): array
    {
        $worker->wait();
        $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput());
        $this->assertSame(1, preg_match('/RESULT (.+)/', $worker->getOutput(), $matches), $worker->getOutput());
        return json_decode($matches[1], true, 512, JSON_THROW_ON_ERROR);
    }

    public function test_native_login_waits_for_reset_and_cannot_issue_a_token_for_the_old_password(): void
    {
        if (! $this->nativeSchema) $this->markTestSkipped('Native parallel test requires the verified private MariaDB runtime.');
        $user = $this->user();
        DB::beginTransaction();
        $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
        $worker = $this->worker('login', ['login' => $user->email, 'password' => 'Temporary!123']);
        try {
            $worker->start();
            $this->assertTrue($worker->waitUntil(fn ($type, $output) => str_contains($output, 'READY')));
            usleep(150000);
            $this->assertTrue($worker->isRunning(), 'Login must wait for the account lock.');
            $locked->update(['password' => Hash::make('Reset!789'), 'must_change_password' => true]);
            $locked->tokens()->delete();
            DB::commit();
            $this->assertSame(401, $this->workerResult($worker)['status']);
            $this->assertSame(0, PersonalAccessToken::count());
        } finally {
            while (DB::transactionLevel()) DB::rollBack();
            $worker->stop();
        }
    }

    public function test_native_reset_serializes_after_forced_completion_and_revokes_its_token(): void
    {
        if (! $this->nativeSchema) $this->markTestSkipped('Native parallel test requires the verified private MariaDB runtime.');
        $target = $this->user('admin');
        $current = $this->login($target);
        $actor = $this->user('super_admin', false);
        $actorToken = $this->login($actor);
        $input = new InputStream;
        $change = $this->worker('change-password', $this->payload(), $current, true);
        $change->setInput($input);
        $reset = $this->worker('reset-password', ['id' => $target->id], $actorToken);
        try {
            $change->start();
            $this->assertTrue($change->waitUntil(fn ($type, $output) => str_contains($output, 'LOCKED')));
            $reset->start();
            $this->assertTrue($reset->waitUntil(fn ($type, $output) => str_contains($output, 'READY')));
            usleep(150000);
            $this->assertTrue($reset->isRunning(), 'Reset must wait for the completing session.');
            $input->write("continue\n");
            $input->close();
            $this->assertSame(200, $this->workerResult($change)['status']);
            $this->assertSame(200, $this->workerResult($reset)['status']);
            $this->assertTrue($target->fresh()->must_change_password);
            $this->assertFalse(Hash::check('Permanent!456', $target->fresh()->password));
            $this->assertNull(PersonalAccessToken::findToken($current));
            $this->assertNotNull(PersonalAccessToken::findToken($actorToken));
        } finally {
            $input->close();
            $change->stop();
            $reset->stop();
        }
    }
}

// Deterministic overlap: authentication has completed, but the controller has
// not acquired its account lock yet. These tests never touch a shared database.
class InterleavePasswordChange
{
    public function handle(Request $request, Closure $next)
    {
        app('security.interleave')();
        return $next($request);
    }
}
