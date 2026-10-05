<?php

namespace Tests\Feature;

use App\Models\Sensor;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 2 — the pre-provisioning command.
 *
 * Runs against MySQL for the same reason as DeviceRotationTest (several
 * migrations use MySQL-only ALTER ... ENUM), so it is skipped under the
 * default SQLite config. Run it with:
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ProvisionDeviceCommandTest
 *
 * Every test is wrapped in a transaction that is rolled back, so nothing is
 * left in the development database.
 */
class ProvisionDeviceCommandTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=ProvisionDeviceCommandTest');
        }
    }

    private function provision(string $name, array $options = []): string
    {
        Artisan::call('agribantay:provision-device', array_merge(['name' => $name], $options));

        return Artisan::output();
    }

    /** Extracts the key from the printed inventory block. */
    private function keyFrom(string $output): ?string
    {
        return preg_match('/Device Key\s*:\s*(AGB-[A-Z0-9]+)/', $output, $m) ? $m[1] : null;
    }

    public function test_command_runs_and_prints_the_device_name(): void
    {
        $name = 'AGB-T' . Str::upper(Str::random(5));

        $this->artisan('agribantay:provision-device', ['name' => $name])
            ->expectsOutputToContain($name)
            ->assertSuccessful();
    }

    public function test_generated_key_matches_the_expected_format(): void
    {
        $key = $this->keyFrom($this->provision('AGB-T' . Str::upper(Str::random(5))));

        $this->assertNotNull($key, 'no Device Key found in the output');
        $this->assertMatchesRegularExpression('/^AGB-[A-Z0-9]{8}$/', $key);
        $this->assertSame(12, strlen($key));

        // The alphabet deliberately omits the characters people misread.
        $this->assertDoesNotMatchRegularExpression('/[01OIL]/', substr($key, 4));
    }

    public function test_successive_runs_produce_different_keys(): void
    {
        $keys = [];

        for ($i = 0; $i < 6; $i++) {
            $keys[] = $this->keyFrom($this->provision('AGB-T' . Str::upper(Str::random(6))));
        }

        $this->assertCount(6, array_unique($keys), 'the command repeated a key');
    }

    public function test_optional_imei_and_sim_are_printed_when_given(): void
    {
        $name = 'AGB-T' . Str::upper(Str::random(5));
        $imei = '863110088686244';
        $sim  = '09204273382';

        $output = $this->provision($name, ['--imei' => $imei, '--sim' => $sim]);

        $this->assertStringContainsString($imei, $output);
        $this->assertStringContainsString($sim, $output);
        $this->assertStringContainsString('IMEI', $output);
        $this->assertStringContainsString('SIM Number', $output);
    }

    public function test_imei_and_sim_lines_are_omitted_when_not_given(): void
    {
        $output = $this->provision('AGB-T' . Str::upper(Str::random(5)));

        $this->assertStringNotContainsString('IMEI', $output);
        $this->assertStringNotContainsString('SIM Number', $output);
    }

    /** The whole point of Phase 2: the command writes nothing. */
    public function test_key_is_not_saved_to_the_database(): void
    {
        $before = Sensor::count();

        $output = $this->provision('AGB-T' . Str::upper(Str::random(5)), [
            '--imei' => '863110088686244',
            '--sim'  => '09204273382',
        ]);

        $key = $this->keyFrom($output);

        $this->assertSame($before, Sensor::count(), 'the command created a sensor row');
        $this->assertSame(0, Sensor::where('device_key', $key)->count());
        $this->assertStringContainsString('NOT SAVED TO THE DATABASE', $output);
    }

    /** A name already registered is refused rather than given a key. */
    public function test_duplicate_device_name_is_refused(): void
    {
        $name = 'AGB-T' . Str::upper(Str::random(5));

        Sensor::create([
            'farm_id'    => null,
            'device_key' => 'AGB-' . Str::upper(Str::random(8)),
            'label'      => $name,
            'status'     => 'Active',
        ]);

        $this->artisan('agribantay:provision-device', ['name' => $name])
            ->expectsOutputToContain('already registered')
            ->assertFailed();
    }

    public function test_blank_device_name_is_refused(): void
    {
        $this->artisan('agribantay:provision-device', ['name' => '   '])
            ->expectsOutputToContain('Device Name is required')
            ->assertFailed();
    }
}
