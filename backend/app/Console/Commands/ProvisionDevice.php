<?php

namespace App\Console\Commands;

use App\Models\Sensor;
use Illuminate\Console\Command;

/**
 * Mints a Device Key for a physical IoT unit BEFORE it is registered in
 * AgriBantay and turned over to the LGU.
 *
 *   php artisan agribantay:provision-device "AGB-D01" --imei=863110088686244 --sim=09204273382
 *
 * Why a command and not an HTTP endpoint: provisioning happens a handful of
 * times, by the developer, before any device exists in the system. Requiring
 * shell access makes it inherently developer-only — no route to authorize, no
 * web surface to get wrong.
 *
 * The key is printed, NOT saved. Nothing is written to the database here. The
 * sensors row is created later, when the Super Admin registers the device with
 * this key. Until then the only copies are the developer's inventory record
 * and the Arduino firmware — losing both means re-provisioning and re-flashing.
 *
 * --imei and --sim are printed for the inventory record only. There are no
 * columns for them, nothing is stored, and the backend never verifies them
 * against the hardware.
 */
class ProvisionDevice extends Command
{
    protected $signature = 'agribantay:provision-device
                            {name : Device Name, e.g. "AGB-D01"}
                            {--imei= : IMEI, printed for the inventory record only}
                            {--sim= : SIM phone number, printed for the inventory record only}';

    protected $description = 'Generate a Device Key for a physical IoT unit before registration (prints only, saves nothing)';

    public function handle(): int
    {
        $name = trim((string) $this->argument('name'));

        if ($name === '') {
            $this->error('Device Name is required.');

            return self::FAILURE;
        }

        if (mb_strlen($name) > 50) {
            $this->error('Device Name must be 50 characters or fewer.');

            return self::FAILURE;
        }

        // A name already in use means this unit was registered before, or the
        // name belongs to a different device. Either way, stop rather than
        // hand out a key that cannot be registered under that name.
        if (Sensor::where('label', $name)->exists()) {
            $this->error("A device named \"{$name}\" is already registered. Choose a different Device Name.");

            return self::FAILURE;
        }

        $key = $this->generateUniqueKey();

        if ($key === null) {
            $this->error('Could not generate a unique Device Key. Please run the command again.');

            return self::FAILURE;
        }

        $this->newLine();
        $this->line('  ─────────────────────────────────────────────');
        $this->line('  DEVICE INVENTORY RECORD');
        $this->line('  ─────────────────────────────────────────────');
        $this->line("  Device Name : {$name}");
        $this->line("  Device Key  : {$key}");

        if ($imei = trim((string) $this->option('imei'))) {
            $this->line("  IMEI        : {$imei}");
        }

        if ($sim = trim((string) $this->option('sim'))) {
            $this->line("  SIM Number  : {$sim}");
        }

        $this->line('  ─────────────────────────────────────────────');
        $this->newLine();

        $this->warn('  NOT SAVED TO THE DATABASE.');
        $this->line('  This key exists only here until the Super Admin registers');
        $this->line('  the device with it. Record it now:');
        $this->newLine();
        $this->line('    1. Write it in the device inventory against this Device Name');
        $this->line('    2. Put it in THIS unit\'s Arduino firmware:');
        $this->line("         const char* DEVICE_KEY = \"{$key}\";");
        $this->line('    3. Check the firmware value matches the inventory record');
        $this->newLine();
        $this->line('  Do not print the Device Key on the physical sticker, and do');
        $this->line('  not reuse this key for any other unit.');
        $this->newLine();

        return self::SUCCESS;
    }

    /**
     * Eight characters from an alphabet with no 0/O and no 1/I/L — those are
     * the characters people misread when copying a key by hand, and a misread
     * key is the usual cause of a 401 at ingestion. random_int() is the
     * CSPRNG; rand()/mt_rand() would be predictable.
     *
     * Checks the sensors table so a key already in use is never handed out.
     * Note this cannot see keys provisioned but not yet registered — with
     * 31^8 combinations a collision there is not a practical concern, but it
     * is why the inventory record matters.
     */
    private function generateUniqueKey(): ?string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $max = strlen($alphabet) - 1;

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $segment = '';

            for ($i = 0; $i < 8; $i++) {
                $segment .= $alphabet[random_int(0, $max)];
            }

            $key = 'AGB-' . $segment;

            if (!Sensor::where('device_key', $key)->exists()) {
                return $key;
            }
        }

        return null;
    }
}
