<?php

namespace Tests\Support;

use App\Models\Farm;
use App\Models\Sensor;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use App\Services\PoultryHouseService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

abstract class PoultryHouseManagementTestCase extends TestCase
{
    private static ?string $sharedFixture = null;

    protected ?string $fixture = null;

    protected bool $transactional = true;

    protected bool $installFoundation = true;

    protected User $admin;

    protected User $owner;

    protected Farm $a;

    protected Farm $b;

    protected Sensor $device;

    protected function setUp(): void
    {
        parent::setUp();
        if (Phase9FoundationDatabase::enabled() && $this->name() === 'test_partial_installation_history_blocks_management_without_repair') {
            $this->transactional = false; // Independent maintenance connection changes the fixture journal.
        }
        if (getenv('POULTRY_HOUSE_MYSQL_TEST') !== '1' && ! Phase9FoundationDatabase::enabled()) {
            $this->markTestSkipped('Explicit disposable local MySQL fixture required.');
        }
        if (! $this->transactional || self::$sharedFixture === null) {
            $this->fixture = Phase9FoundationDatabase::enabled()
                ? Phase9FoundationDatabase::create($this->installFoundation) : PoultryHouseDatabase::create();
            try {
                if ($this->installFoundation && ! Phase9FoundationDatabase::enabled()) {
                    PoultryHouseDatabase::migrate(true);
                }
            } catch (\Throwable $error) {
                DB::purge('house_phase2');
                self::dropFixture($this->fixture);
                $this->fixture = null;
                throw $error;
            }
            if ($this->transactional) {
                self::$sharedFixture = $this->fixture;
            }
        } else {
            $this->fixture = self::$sharedFixture;
            if (Phase9FoundationDatabase::enabled()) {
                Phase9FoundationDatabase::bind($this->fixture);
            } else {
                config(['database.connections.house_phase2' => PoultryHouseDatabase::fixtureConnection($this->fixture)]);
                DB::purge('house_phase2');
                DB::setDefaultConnection('house_phase2');
            }
        }
        if ($this->transactional) {
            DB::beginTransaction();
        }
        config(['cache.default' => 'array', 'logging.default' => 'null',
            'services.unisms.secret_key' => '', 'services.gemini.api_key' => '']);
        Mail::fake();
        Http::preventStrayRequests();
        $this->admin = $this->user('super_admin');
        $this->owner = $this->user('farm_owner');
        $this->actingAs($this->admin, 'sanctum');
        $this->a = $this->createFarm($this->owner);
        $this->b = $this->createFarm($this->owner);
        $this->device = $this->makeDevice();
        $this->device = app(DeviceAssignmentService::class)->change($this->device->id, $this->a->id);
    }

    protected function tearDown(): void
    {
        if ($this->fixture) {
            while (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            DB::purge('house_phase2');
            if (! $this->transactional) {
                self::dropFixture($this->fixture);
            }
        }
        $this->travelBack();
        parent::tearDown();
    }

    public static function tearDownAfterClass(): void
    {
        if (self::$sharedFixture) {
            self::dropFixture(self::$sharedFixture);
            self::$sharedFixture = null;
        }
        parent::tearDownAfterClass();
    }

    private static function dropFixture(string $name): void
    {
        if (Phase9FoundationDatabase::enabled()) {
            Phase9FoundationDatabase::drop($name);
        } else {
            PoultryHouseDatabase::drop($name);
        }
    }

    protected function user(string $role): User
    {
        return User::create(['first_name' => 'Synthetic', 'last_name' => $role,
            'email' => Str::uuid().'@example.test', 'mobile_number' => '09'.str_pad((string) (User::count() + 1), 9, '0', STR_PAD_LEFT),
            'password' => 'unusable-fixture', 'role' => $role, 'status' => 'active',
            'must_change_password' => false, 'legal_acknowledged_at' => now()]);
    }

    protected function createFarm(?User $owner = null): Farm
    {
        $owner ??= $this->owner;

        return Farm::create(['user_id' => $owner->id, 'farm_name' => 'Synthetic '.Str::uuid(),
            'owner_name' => $owner->full_name, 'mobile_number' => $owner->mobile_number,
            'barangay' => 'Calansayan', 'municipality' => 'San Jose', 'province' => 'Batangas',
            'farm_size' => 'Small', 'current_status' => 'Safe', 'status' => 'Active']);
    }

    protected function createRegisteredFarm(int $count = 1, ?User $owner = null): Farm
    {
        return DB::transaction(function () use ($count, $owner) {
            $farm = $this->createFarm($owner);
            app(PoultryHouseService::class)->initializeRegistration($this->admin, $farm, $count, (string) Str::uuid());

            return $farm->refresh();
        });
    }

    protected function makeDevice(string $status = 'Active'): Sensor
    {
        return Sensor::create(['device_key' => (string) Str::uuid(), 'label' => 'Synthetic device '.Str::uuid(),
            'sensor_code' => (string) Str::uuid(), 'status' => $status]);
    }

    protected function registrationPayload(): array
    {
        return ['first_name' => 'Registration', 'last_name' => 'Fixture', 'email' => 'registration@example.test',
            'mobile_number' => '09940000001', 'address' => 'Synthetic owner address',
            'farms' => [
                ['farm_name' => 'Atomic Farm 1', 'farm_size' => 'Small', 'house_count' => 3,
                    'barangay' => 'Calansayan', 'latitude' => 13.855, 'longitude' => 121.093],
                ['farm_name' => 'Atomic Farm 2', 'farm_size' => 'Medium', 'house_count' => 2,
                    'barangay' => 'Calansayan', 'latitude' => 13.855, 'longitude' => 121.103],
            ]];
    }
}
