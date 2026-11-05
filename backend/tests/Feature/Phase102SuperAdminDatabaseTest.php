<?php

namespace Tests\Feature;

use App\Mail\OtpCodeMail;
use App\Models\ActivityLog;
use App\Models\PasswordResetOtp;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Opt-in, native MySQL only. All created schema fixtures are retained. */
class Phase102SuperAdminDatabaseTest extends TestCase
{
    private bool $transaction = false;

    private string $beforeInstall;

    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('PHASE102_TEST_MYSQL') !== '1') {
            $this->markTestSkipped('Explicit isolated MySQL fixture required.');
        }
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.mysql.host'), ['127.0.0.1', 'localhost', '::1']);
        $this->beforeInstall = $this->digest();
        if (! DB::connection()->getSchemaBuilder()->hasColumn('users', 'super_admin_slot')) {
            $this->migration()->up();
        }
        $this->assertSame($this->beforeInstall, $this->digest(), 'Installing protections must preserve account attributes.');
        DB::beginTransaction();
        $this->transaction = true;
        config(['cache.default' => 'array', 'logging.default' => 'null']);
        Http::preventStrayRequests();
        Http::fake();
        Mail::fake();
        $this->super = User::where('role', 'super_admin')->firstOrFail();
        $this->actingAs($this->super, 'sanctum');
    }

    protected function tearDown(): void
    {
        if ($this->transaction) {
            DB::rollBack();
        }
        parent::tearDown();
    }

    private function migration()
    {
        return require database_path('approval-required/2026_10_31_120000_protect_sole_super_admin.php');
    }

    private function digest(): string
    {
        $columns = array_values(array_diff(DB::connection()->getSchemaBuilder()->getColumnListing('users'), ['super_admin_slot']));

        return hash('sha256', json_encode(DB::table('users')->orderBy('id')->get($columns)->all()));
    }

    private function rejected(callable $action): void
    {
        $before = $this->digest();
        try {
            $action();
            $this->fail('Protected database mutation must be rejected.');
        } catch (QueryException $error) {
            $this->assertSame('45000', $error->errorInfo[0]);
        }
        $this->assertSame($before, $this->digest());
        $this->assertSame(1, User::where('role', 'super_admin')->count());
        $this->assertSame('active', $this->super->fresh()->status);
    }

    private function extra(array $changes = []): array
    {
        return array_replace(['first_name' => 'Private', 'last_name' => 'Additional', 'email' => Str::uuid().'@example.test',
            'password' => Str::random(64), 'role' => 'super_admin', 'status' => 'active', 'created_at' => now(), 'updated_at' => now()], $changes);
    }

    public function test_installed_objects_and_derived_values_preserve_the_original_accounts(): void
    {
        $this->assertSame(1, (int) DB::table('users')->where('role', 'super_admin')->value('super_admin_slot'));
        $this->assertSame(0, DB::table('users')->where('role', '!=', 'super_admin')->whereNotNull('super_admin_slot')->count());
        $column = DB::selectOne("SELECT EXTRA AS extra,GENERATION_EXPRESSION AS expression FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='super_admin_slot'");
        $this->assertSame('STORED GENERATED', $column->extra);
        $this->assertStringContainsString('super_admin', $column->expression);
        $index = DB::select("SELECT NON_UNIQUE AS non_unique,COLUMN_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='users_super_admin_singleton_unique'");
        $this->assertCount(1, $index);
        $this->assertSame(0, (int) $index[0]->non_unique);
        $this->assertSame('super_admin_slot', $index[0]->name);
        $triggers = DB::select("SELECT TRIGGER_NAME AS name,ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,ACTION_STATEMENT AS body FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'");
        $this->assertCount(3, $triggers);
        foreach ($triggers as $trigger) {
            $this->assertSame('BEFORE', $trigger->timing);
            $this->assertStringContainsString('45000', $trigger->body);
        }
        $this->assertEqualsCanonicalizing(['INSERT', 'UPDATE', 'DELETE'], array_column($triggers, 'event'));
        $this->assertArrayNotHasKey('super_admin_slot', $this->super->toArray());
        $this->assertArrayNotHasKey('password', $this->super->toArray());
    }

    public static function blockedOperations(): array
    {
        return array_map(fn ($case) => [$case], ['insert-active', 'insert-inactive', 'insert-ignore', 'upsert', 'model-create', 'synthetic-seeder', 'events-bypass', 'update-ignore', 'multirow-insert', 'promote', 'bulk-promote', 'deactivate', 'demote', 'delete', 'bulk-delete', 'identity', 'replace', 'generated-column']);
    }

    #[DataProvider('blockedOperations')]
    public function test_direct_sql_and_bulk_mutations_cannot_replace_or_remove_the_authorized_account(string $case): void
    {
        if ($case === 'generated-column') {
            $before = $this->digest();
            try {
                DB::table('users')->where('id', $this->super->id)->update(['super_admin_slot' => null]);
                $this->fail('Generated slot cannot be overridden.');
            } catch (QueryException $e) {
                $this->assertSame(3105, (int) $e->errorInfo[1]);
            }
            $this->assertSame($before, $this->digest());

            return;
        }
        $this->rejected(function () use ($case) {
            switch ($case) {
                case 'insert-active': DB::table('users')->insert($this->extra());
                    break;
                case 'insert-inactive': DB::table('users')->insert($this->extra(['status' => 'inactive']));
                    break;
                case 'insert-ignore': DB::table('users')->insertOrIgnore($this->extra());
                    break;
                case 'upsert': DB::table('users')->upsert([$this->extra()], ['email'], ['first_name']);
                    break;
                case 'model-create': User::create($this->extra());
                    break;
                case 'synthetic-seeder':
                    $row = $this->extra();
                    $seeder = new class($row) extends Seeder
                    {
                        public function __construct(private array $row) {}

                        public function run(): void
                        {
                            User::create($this->row);
                        }
                    };
                    $seeder->run();
                    break;
                case 'events-bypass': User::withoutEvents(fn () => User::findOrFail($this->super->id)->delete());
                    break;
                case 'update-ignore': DB::update('UPDATE IGNORE users SET role = ? WHERE role = ?', ['super_admin', 'admin']);
                    break;
                case 'multirow-insert': DB::table('users')->insert([$this->extra(['role' => 'admin']), $this->extra()]);
                    break;
                case 'promote': User::where('role', 'admin')->firstOrFail()->update(['role' => 'super_admin']);
                    break;
                case 'bulk-promote': DB::table('users')->where('role', 'admin')->update(['role' => 'super_admin']);
                    break;
                case 'deactivate': DB::table('users')->where('id', $this->super->id)->update(['status' => 'inactive']);
                    break;
                case 'demote': DB::table('users')->where('id', $this->super->id)->update(['role' => 'admin']);
                    break;
                case 'delete': DB::table('users')->where('id', $this->super->id)->delete();
                    break;
                case 'bulk-delete': DB::table('users')->whereIn('role', ['admin', 'super_admin'])->delete();
                    break;
                case 'identity': DB::table('users')->where('id', $this->super->id)->update(['id' => 900001]);
                    break;
                case 'replace':
                    DB::statement('REPLACE INTO users (id,first_name,last_name,email,password,role,status) VALUES (?,?,?,?,?,?,?)', [$this->super->id, 'Private', 'Replacement', 'replace@example.test', Str::random(64), 'admin', 'active']);
                    break;
            }
        });
    }

    public function test_failed_transaction_rolls_back_other_account_and_profile_writes(): void
    {
        $before = $this->digest();
        $email = Str::uuid().'@example.test';
        try {
            DB::transaction(function () use ($email) {
                DB::table('users')->insert($this->extra(['role' => 'admin', 'email' => $email]));
                DB::table('users')->where('id', $this->super->id)->update(['first_name' => 'Uncommitted']);
                DB::table('users')->where('id', $this->super->id)->update(['status' => 'inactive']);
            });
            $this->fail('Transaction must fail.');
        } catch (QueryException $e) {
            $this->assertSame('45000', $e->errorInfo[0]);
        }
        $this->assertSame($before, $this->digest());
        $this->assertFalse(User::where('email', $email)->exists());
    }

    public function test_generated_unique_slot_independently_rejects_an_inactive_duplicate(): void
    {
        // CREATE ... LIKE preserves the generated unique key, not triggers.
        // A temporary private probe tests the second layer without removing guards.
        $table = 'guard_unique_probe_'.bin2hex(random_bytes(5));
        DB::statement('CREATE TEMPORARY TABLE `'.$table.'` LIKE users');
        DB::table($table)->insert($this->extra());
        try {
            DB::table($table)->insert($this->extra(['status' => 'inactive']));
            $this->fail('Unique slot must include inactive accounts.');
        } catch (QueryException $e) {
            $this->assertSame(1062, (int) $e->errorInfo[1]);
        }
        $this->assertSame(1, DB::table($table)->count());
        $this->assertSame(1, User::where('role', 'super_admin')->count());
    }

    public function test_profile_updates_multiple_staff_vets_and_farmer_ownership_work_with_database_guards(): void
    {
        $identity = $this->super->id;
        $this->putJson('/api/settings/profile', ['first_name' => 'Private', 'last_name' => 'Updated', 'mobile_number' => $this->super->mobile_number])->assertOk();
        $this->assertSame($identity, $this->super->fresh()->id);
        $this->assertSame('super_admin', $this->super->fresh()->role);
        $this->assertSame('Updated', $this->super->fresh()->last_name);
        foreach (['admin', 'vet'] as $role) {
            $before = User::where('role', $role)->count();
            for ($i = 0; $i < 2; $i++) {
                $email = Str::uuid().'@example.test';
                $this->postJson('/api/superadmin/accounts', ['full_name' => 'Private Multiple '.$role.' '.$i, 'role' => $role, 'email' => $email])->assertOk()->assertJsonPath('success', true);
                $account = User::where('email', $email)->firstOrFail();
                $this->patchJson('/api/superadmin/accounts/'.$account->id.'/deactivate')->assertOk();
                $this->assertSame('inactive', $account->fresh()->status);
                $this->patchJson('/api/superadmin/accounts/'.$account->id.'/activate')->assertOk();
                $this->assertSame('active', $account->fresh()->status);
                $this->assertSame($role, $account->fresh()->role);
            }
            $this->assertSame($before + 2, User::where('role', $role)->count());
        }
        $this->postJson('/api/superadmin/accounts', ['full_name' => 'Not allowed', 'role' => 'super_admin', 'email' => 'denied@example.test'])->assertUnprocessable();
        $this->assertSame(1, User::where('role', 'super_admin')->count());
        $owner = User::where('role', 'farm_owner')->firstOrFail();
        $farms = $owner->farms()->pluck('id')->all();
        $this->actingAs($owner, 'sanctum')->getJson('/api/farmer/farms')->assertOk();
        $this->postJson('/api/superadmin/accounts', ['full_name' => 'Denied', 'role' => 'admin', 'email' => 'denied-farmer@example.test'])->assertForbidden();
        $this->assertSame($farms, $owner->fresh()->farms()->pluck('id')->all());
        Http::assertNothingSent();
    }

    public function test_existing_super_admin_otp_recovery_preserves_identity_and_expires_bearer_sessions(): void
    {
        $token = $this->super->createToken('private-existing-session')->accessToken;
        $this->postJson('/api/password/otp/request', ['login' => $this->super->email, 'channel' => 'email'])->assertOk();
        $mail = Mail::sent(OtpCodeMail::class)->first();
        $this->assertNotNull($mail);
        $reset = $this->postJson('/api/password/otp/verify', ['login' => $this->super->email, 'channel' => 'email', 'code' => $mail->code])->assertOk()->json('reset_token');
        $this->assertIsString($reset);
        $password = 'Private!8aA'.Str::random(16);
        $this->postJson('/api/password/reset', ['reset_token' => $reset, 'new_password' => $password, 'new_password_confirmation' => $password])->assertOk();
        $this->assertTrue(Hash::check($password, $this->super->fresh()->password));
        $this->assertSame('super_admin', $this->super->fresh()->role);
        $this->assertSame('active', $this->super->fresh()->status);
        $this->assertSame(1, User::where('role', 'super_admin')->count());
        $this->assertTrue($token->fresh()->expires_at->lte(now()));
        $this->assertSame(0, PasswordResetOtp::where('user_id', $this->super->id)->whereNull('consumed_at')->count());
        $this->assertSame(1, ActivityLog::where('user_id', $this->super->id)->where('action', 'Password Reset Completed')->count());
        $this->postJson('/api/login', ['login' => $this->super->email, 'password' => $password])->assertOk()
            ->assertJsonPath('user.id', $this->super->id)->assertJsonPath('user.role', 'super_admin');
        Http::assertNothingSent();
    }

    public function test_guard_removal_and_ddl_inside_a_transaction_are_refused(): void
    {
        foreach (['down', 'up'] as $method) {
            try {
                $this->migration()->{$method}();
                $this->fail('Unsafe DDL lifecycle must fail.');
            } catch (\RuntimeException $e) {
                $this->assertStringContainsString($method === 'down' ? 'separately approved' : 'transactions', $e->getMessage());
            }
        }
        try {
            DB::pretend(fn () => $this->migration()->up());
            $this->fail('Pretend cannot substitute for real preflight.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('real metadata', $e->getMessage());
        }
        $this->assertSame(3, (int) DB::selectOne("SELECT COUNT(*) AS total FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->total);
    }

    public static function invalidStates(): array
    {
        return [['missing'], ['inactive'], ['duplicate'], ['partial']];
    }

    public function test_unreviewed_database_driver_is_refused_before_schema_changes(): void
    {
        config(['database.connections.unsupported_guard_fixture' => ['driver' => 'sqlite', 'database' => ':memory:']]);
        try {
            DB::usingConnection('unsupported_guard_fixture', fn () => $this->migration()->up());
            $this->fail('Unsupported database cannot receive safeguards.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('reviewed MySQL 8.x', $e->getMessage());
        }
    }

    #[DataProvider('invalidStates')]
    public function test_invalid_existing_account_states_fail_before_any_ddl(string $state): void
    {
        // Source helper copies only schema metadata under READ ONLY; no rows.
        $p = new Process([PHP_BINARY, base_path('tests/Support/create-table-fixture.php')], base_path(), ['DB_DATABASE' => false, 'DB_URL' => false, 'DB_CONNECTION' => false]);
        $p->setTimeout(30);
        $p->run();
        $this->assertTrue($p->isSuccessful(), 'Private schema fixture creation failed.');
        $database = trim($p->getOutput());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', $database);
        config(['database.connections.invalid_guard_fixture' => array_replace(config('database.connections.mysql'), ['database' => $database, 'url' => null])]);
        DB::purge('invalid_guard_fixture');
        $other = DB::connection('invalid_guard_fixture');
        if ($state === 'missing') {
            $other->table('users')->where('role', 'super_admin')->update(['role' => 'admin']);
        } elseif ($state === 'inactive') {
            $other->table('users')->where('role', 'super_admin')->update(['status' => 'inactive']);
        } elseif ($state === 'duplicate') {
            $other->table('users')->insert($this->extra());
        } else {
            $other->unprepared('CREATE TRIGGER private_existing_users_guard BEFORE UPDATE ON users FOR EACH ROW SET NEW.first_name = NEW.first_name');
        }
        $before = hash('sha256', json_encode($other->table('users')->orderBy('id')->get()->all()));
        $migration = $this->migration();
        try {
            DB::usingConnection('invalid_guard_fixture', fn () => $migration->up());
            $this->fail('Invalid account state cannot be provisioned/repaired by migration.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString($state === 'partial' ? 'Existing or partial' : 'Exactly one existing active', $e->getMessage());
        }
        $this->assertFalse($other->getSchemaBuilder()->hasColumn('users', 'super_admin_slot'));
        $this->assertSame($state === 'partial' ? 1 : 0, (int) $other->selectOne("SELECT COUNT(*) AS total FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->total);
        $this->assertSame($before, hash('sha256', json_encode($other->table('users')->orderBy('id')->get()->all())));
        fwrite(STDOUT, "\nRetained invalid-state fixture: {$database}\n");
    }
}
