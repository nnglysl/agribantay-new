<?php

namespace Tests\Feature;

use App\Models\{Farm, User};
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Http, Schema};
use Tests\TestCase;

/** Real Staff/Vet routes against one synthetic farm in SQLite memory only. */
class VetFarmOverviewReadOnlyTest extends TestCase
{
    private User $staff;
    private User $vet;
    private User $owner;
    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:',
            'database.connections.sqlite.url' => null, 'cache.default' => 'array', 'session.driver' => 'array']);
        DB::purge('sqlite');
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        Http::preventStrayRequests();
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            foreach (['first_name', 'last_name', 'email', 'mobile_number', 'address', 'profile_photo_path', 'password', 'role', 'status'] as $name) $table->string($name)->nullable();
            $table->timestamps();
        });
        Schema::create('farms', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('user_id')->nullable();
            foreach (['farm_name', 'owner_name', 'mobile_number', 'barangay', 'address', 'farm_size', 'status', 'current_status'] as $name) $table->string($name)->nullable();
            $table->double('latitude')->nullable(); $table->double('longitude')->nullable(); $table->timestamps();
        });
        Schema::create('sensors', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('farm_id')->nullable(); $table->string('status')->nullable();
            $table->date('installed_at')->nullable(); $table->timestamp('last_seen_at')->nullable(); $table->timestamps();
        });
        Schema::create('sensor_readings', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('farm_id'); $table->unsignedBigInteger('sensor_id')->nullable(); $table->timestamps();
        });
        Schema::create('inspections', function (Blueprint $table) { $table->id(); $table->unsignedBigInteger('farm_id'); $table->timestamps(); });
        Schema::create('maintenance_logs', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('farm_id'); $table->string('maintenance_type'); $table->date('performed_at'); $table->timestamps();
        });
        Schema::create('manure_disposal_records', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('farm_id'); $table->date('disposal_date'); $table->timestamps();
        });
        $this->staff = User::create(['role' => 'admin', 'status' => 'active', 'first_name' => 'Synthetic Staff']);
        $this->vet = User::create(['role' => 'vet', 'status' => 'active', 'first_name' => 'Synthetic Vet']);
        $this->owner = User::create(['role' => 'farm_owner', 'status' => 'active', 'first_name' => 'Mara', 'last_name' => 'Reyes',
            'email' => 'owner@example.test', 'mobile_number' => '09000000004', 'address' => 'Owner residence, Aya, San Jose, Batangas']);
        $this->farm = Farm::forceCreate(['id' => 17, 'user_id' => $this->owner->id, 'farm_name' => 'Calansayan Poultry Farm',
            'owner_name' => 'Outdated owner name copy', 'mobile_number' => '09000000099', 'status' => 'Active', 'farm_size' => 'Medium',
            'barangay' => 'Calansayan', 'address' => 'Lot 12, Calansayan, San Jose, Batangas',
            'latitude' => 13.855123, 'longitude' => 121.093456, 'created_at' => '2026-06-11 19:00:00']);
    }

    public function test_both_roles_receive_the_same_stored_farm_owner_and_coordinates_without_writes(): void
    {
        $originalFarm = $this->farm->fresh()->getAttributes();
        $originalOwner = $this->owner->fresh()->getAttributes();
        $queries = [];
        DB::listen(function ($query) use (&$queries) { $queries[] = $query->sql; });
        $this->actingAs($this->staff, 'sanctum');
        $staff = $this->getJson('/api/admin/farms/17')->assertOk()->json('data');
        $staffHouses = $this->getJson('/api/farms/17/poultry-houses')->assertOk()->json('data');
        $this->actingAs($this->vet, 'sanctum');
        $vet = $this->getJson('/api/vet/farms/17')->assertOk()->json('data');
        $vetHouses = $this->getJson('/api/farms/17/poultry-houses')->assertOk()->json('data');

        foreach (['id', 'farm_name', 'barangay', 'farm_size', 'status', 'address', 'latitude', 'longitude', 'created_at'] as $field) {
            $this->assertSame($staff[$field], $vet[$field], $field.' differs between roles');
        }
        $this->assertSame($staff['user']['address'], $vet['owner_address']);
        $this->assertNotSame($vet['address'], $vet['owner_address']);
        $this->assertSame($staff['user']['first_name'], $vet['owner_first_name']);
        $this->assertSame($staff['user']['last_name'], $vet['owner_last_name']);
        $this->assertSame($staff['user']['mobile_number'], $vet['mobile_number']);
        $this->assertSame($staff['user']['email'], $vet['email']);
        $this->assertSame($staffHouses, $vetHouses);
        foreach (['user', 'password', 'remember_token', 'device_key', 'sensors', 'device_list'] as $forbidden) $this->assertArrayNotHasKey($forbidden, $vet);
        $this->assertSame($originalFarm, $this->farm->fresh()->getAttributes());
        $this->assertSame($originalOwner, $this->owner->fresh()->getAttributes());
        $this->assertCount(0, array_filter($queries, fn ($sql) => preg_match('/^\s*(insert|update|delete|replace|alter|create|drop|truncate)\b/i', $sql)));

        // The browser test consumes these actual controller responses rather
        // than hand-writing values that could conceal a serializer regression.
        if ($path = getenv('VET_OVERVIEW_FIXTURE_PATH')) {
            $this->assertStringStartsWith(strtolower(realpath(sys_get_temp_dir())), strtolower(realpath(dirname($path))));
            file_put_contents($path, json_encode(['staff' => $staff, 'vet' => $vet, 'staff_houses' => $staffHouses, 'vet_houses' => $vetHouses], JSON_THROW_ON_ERROR));
        }
    }

    public function test_missing_owner_address_and_coordinates_remain_null_not_farm_address_or_zero(): void
    {
        $this->owner->update(['address' => null]);
        $this->farm->update(['latitude' => null, 'longitude' => null]);
        $this->actingAs($this->vet, 'sanctum');
        $this->getJson('/api/vet/farms/17')->assertOk()
            ->assertJsonPath('data.owner_address', null)->assertJsonPath('data.latitude', null)->assertJsonPath('data.longitude', null)
            ->assertJsonPath('data.address', 'Lot 12, Calansayan, San Jose, Batangas');
    }

    public function test_house_listing_and_refresh_are_safe_without_house_tables(): void
    {
        $this->assertFalse(Schema::hasTable('poultry_houses'));
        $this->assertFalse(Schema::hasTable('poultry_house_initializations'));
        $queries = [];
        DB::listen(function ($query) use (&$queries) { $queries[] = $query->sql; });
        $this->actingAs($this->vet, 'sanctum');
        for ($refresh = 0; $refresh < 2; $refresh++) {
            $this->getJson('/api/farms/17/poultry-houses')->assertOk()
                ->assertJsonPath('data.available', false)->assertJsonPath('data.can_manage', false)->assertJsonCount(0, 'data.houses')
                ->assertJsonPath('data.message', 'Poultry house records are not available yet. Existing farm monitoring remains available.');
        }
        $this->assertCount(0, array_filter($queries, fn ($sql) => preg_match('/\bpoultry_house(?:s|_initializations)\b/i', $sql)));
        $this->assertCount(0, array_filter($queries, fn ($sql) => preg_match('/^\s*(insert|update|delete|replace|alter|create|drop|truncate)\b/i', $sql)));
    }

    public function test_vet_write_and_management_routes_remain_forbidden(): void
    {
        $this->actingAs($this->vet, 'sanctum');
        $this->putJson('/api/admin/farms/17', [])->assertForbidden();
        $this->getJson('/api/admin/sensors')->assertForbidden();
        $this->postJson('/api/farms/17/poultry-houses', [])->assertForbidden();
        $this->patchJson('/api/farms/17/poultry-houses/1/deactivate', [])->assertForbidden();
        $this->patchJson('/api/farms/17/poultry-houses/1/reactivate', [])->assertForbidden();
    }

    public function test_vet_cannot_read_inactive_farms_or_their_house_inventory(): void
    {
        $this->farm->update(['status' => 'Inactive']);
        $this->actingAs($this->vet, 'sanctum');
        $this->getJson('/api/vet/farms/17')->assertNotFound();
        $this->getJson('/api/farms/17/poultry-houses')->assertNotFound();
    }
}
