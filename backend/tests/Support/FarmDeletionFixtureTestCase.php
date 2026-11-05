<?php

namespace Tests\Support;

use App\Models\Farm;
use App\Models\User;
use App\Services\PoultryHouseFoundationReadiness;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Existing deletion/owner regressions now use disposable native schemas exclusively. */
abstract class FarmDeletionFixtureTestCase extends TestCase
{
    private static ?string $fixture = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('POULTRY_HOUSE_MYSQL_TEST') !== '1' && ! Phase9FoundationDatabase::enabled()) {
            $this->markTestSkipped('Enable POULTRY_HOUSE_MYSQL_TEST=1 for guarded disposable local fixtures.');
        }
        if (self::$fixture === null) {
            self::$fixture = Phase9FoundationDatabase::enabled() ? Phase9FoundationDatabase::create() : PoultryHouseDatabase::create();
            try {
                if (! Phase9FoundationDatabase::enabled()) {
                    foreach (array_keys(PoultryHouseFoundationReadiness::MYSQL) as $migration) {
                        app('migrator')->run([base_path('database/migrations/'.$migration.'.php')], ['step' => true]);
                    }
                }
            } catch (\Throwable $error) {
                DB::purge('house_phase2');
                self::dropFixture(self::$fixture);
                self::$fixture = null;
                throw $error;
            }
        } else {
            if (Phase9FoundationDatabase::enabled()) {
                Phase9FoundationDatabase::bind(self::$fixture);
            } else {
                config(['database.connections.house_phase2' => PoultryHouseDatabase::fixtureConnection(self::$fixture)]);
                DB::purge('house_phase2');
                DB::setDefaultConnection('house_phase2');
            }
        }
        DB::beginTransaction();
        config(['cache.default' => 'array']);
        Mail::fake();
        Http::preventStrayRequests();
        Http::fake();
        $this->withoutMiddleware(ThrottleRequests::class);
        foreach (['super_admin', 'admin', 'vet'] as $role) {
            User::create(['first_name' => 'Synthetic', 'last_name' => $role, 'email' => Str::uuid().'@example.test',
                'password' => 'unusable-fixture', 'role' => $role, 'status' => 'active',
                'must_change_password' => false, 'legal_acknowledged_at' => now()]);
        }
    }

    protected function tearDown(): void
    {
        if (self::$fixture) {
            while (DB::transactionLevel()) {
                DB::rollBack();
            }
            DB::purge('house_phase2');
        }
        $this->travelBack();
        parent::tearDown();
    }

    public static function tearDownAfterClass(): void
    {
        if (self::$fixture) {
            self::dropFixture(self::$fixture);
            self::$fixture = null;
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

    protected function deletionData(array $extra = []): array
    {
        return $extra + ['permanently_discontinued' => true, 'acknowledge_permanent_loss' => true];
    }

    protected function verifyEmptyFixtureInventory(Farm $farm): void
    {
        // Only synthetic farms in the guarded fixture; never populate a real farm.
        if (DB::table('poultry_house_initializations')->where('farm_id', $farm->id)->exists()) {
            return;
        }
        DB::table('farms')->where('id', $farm->id)->update(['house_inventory_verified_at' => now()]);
        DB::table('poultry_house_initializations')->insert(['farm_id' => $farm->id, 'operation_id' => (string) Str::uuid(),
            'source' => 'verified_population', 'initial_house_count' => 0, 'verification_reference' => 'Synthetic verified empty inventory',
            'verifier_role' => 'super_admin', 'completed_at' => now()]);
    }
}
