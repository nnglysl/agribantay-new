<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class LogoutTest extends TestCase
{
    public function createApplication()
    {
        if (is_file(dirname(__DIR__, 2).'/bootstrap/cache/config.php')) {
            throw new \RuntimeException('Logout tests refuse cached application configuration.');
        }
        // Force the isolated target before Laravel boots; never use operational credentials.
        foreach (['APP_ENV' => 'testing', 'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => ':memory:',
            'DB_URL' => '', 'DB_SOCKET' => '', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array',
            'QUEUE_CONNECTION' => 'sync', 'MAIL_MAILER' => 'array', 'LOG_CHANNEL' => 'null'] as $key => $value) {
            putenv($key.'='.$value);
            $_ENV[$key] = $_SERVER[$key] = $value;
        }

        return parent::createApplication();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        Http::preventStrayRequests();
        Mail::fake();
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            foreach (['first_name', 'last_name', 'email', 'mobile_number', 'password', 'role', 'status'] as $name) {
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
    }

    public static function sessions(): array
    {
        $cases = [];
        foreach (['farm_owner', 'admin', 'super_admin', 'vet'] as $role) {
            foreach ([false, true] as $remember) {
                $cases[$role.($remember ? ' remembered' : ' unremembered')] = [$role, $remember];
            }
        }

        return $cases;
    }

    private function user(string $role, string $email): User
    {
        return User::create(['first_name' => 'Synthetic', 'last_name' => 'Logout', 'role' => $role,
            'status' => 'active', 'email' => $email, 'password' => Hash::make('Synthetic!pass123'),
            'must_change_password' => false]);
    }

    private function bearer(string $token): static
    {
        // Resolve authentication afresh, as a separate HTTP request would.
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    #[DataProvider('sessions')]
    public function test_logout_revokes_only_the_current_token_and_rejects_its_reuse(string $role, bool $remember): void
    {
        $user = $this->user($role, 'logout@example.test');
        $sibling = $user->createToken('another-browser')->plainTextToken;
        $other = $this->user('farm_owner', 'independent@example.test');
        $independent = $other->createToken('independent-user')->plainTextToken;
        $login = $this->postJson('/api/login', ['login' => $user->email, 'password' => 'Synthetic!pass123', 'remember' => $remember])->assertOk();
        $token = $login->json('token');
        $this->assertNotNull(PersonalAccessToken::findToken($token));

        $this->bearer($token)->postJson('/api/logout')->assertOk();
        $this->assertNull(PersonalAccessToken::findToken($token));
        $this->bearer($token)->getJson('/api/me')->assertUnauthorized();
        $this->bearer($token)->postJson('/api/logout')->assertUnauthorized();
        $this->bearer($sibling)->getJson('/api/me')->assertOk()->assertJsonPath('id', $user->id);
        $this->bearer($independent)->getJson('/api/me')->assertOk()->assertJsonPath('id', $other->id);
        $this->assertSame(2, PersonalAccessToken::count());
        Http::assertNothingSent();
        Mail::assertNothingSent();
    }

    public function test_expired_or_invalid_tokens_do_not_revoke_unrelated_sessions(): void
    {
        $user = $this->user('admin', 'logout@example.test');
        $valid = $user->createToken('valid')->plainTextToken;
        $expired = $user->createToken('expired', ['*'], now()->subMinute())->plainTextToken;
        foreach ([$expired, '999999|'.str_repeat('x', 40)] as $token) {
            $this->bearer($token)->postJson('/api/logout')->assertUnauthorized();
            $this->assertNotNull(PersonalAccessToken::findToken($valid));
        }
        $this->bearer($valid)->getJson('/api/me')->assertOk();
        $this->assertSame(2, PersonalAccessToken::count());
    }

    public function test_missing_credentials_are_rejected_without_changing_tokens(): void
    {
        $user = $this->user('vet', 'logout@example.test');
        $token = $user->createToken('valid')->plainTextToken;
        $this->postJson('/api/logout')->assertUnauthorized();
        $this->assertNotNull(PersonalAccessToken::findToken($token));
    }
}
