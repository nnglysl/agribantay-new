<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use App\Models\User;
use App\Models\Farm;
use App\Models\MaintenanceLog;

/**
 * Objective 5.1 test data — Overdue Maintenance.
 *
 * Every "status" here is 100% computed live by MaintenanceStatusService
 * from real performed_at/created_at dates. Nothing is written as a fake
 * status label — that's the whole point of this seeder. The date offsets
 * below are chosen relative to now() specifically to land on each side
 * of MaintenanceStatusService's real thresholds:
 *
 *   Small  farm: due at 365d, grace ends (Overdue) at 395d
 *   Medium farm: due at 270d, grace ends (Overdue) at 300d
 *   Large  farm: due at 180d, grace ends (Overdue) at 210d
 *
 * For each farm size, 5 test cases are seeded:
 *   1. Normal          — well within the interval, "Up to date"
 *   2. Upcoming         — close to the due date but not yet due, "Up to date"
 *   3. Within grace     — past due, inside the 30-day grace window, "Due"
 *   4. Just overdue     — just past the grace period, "Overdue" (small days_overdue)
 *   5. Severely overdue — far past the grace period, "Overdue" (large days_overdue)
 *
 * Plus one farm that has NEVER logged a clean-out at all, so its status
 * is computed from farm.created_at instead of a MaintenanceLog.
 *
 * latitude/longitude are seeded for every farm (approximate points within
 * San Jose, Batangas, spread near each farm's barangay) so these farms
 * also render as pins on the Farm Monitoring Map, not just in the plain
 * Farms list/registry and Overdue Maintenance report. Coordinates here
 * are reasonable placeholders near each barangay's rough position — not
 * precisely geocoded — which is fine for test/demo data, but if you want
 * pixel-accurate pins later, re-geocode via the same Nominatim flow the
 * real farm registration form uses.
 */
class OverdueMaintenanceTestSeeder extends Seeder
{
    private const INTERVAL = [
        'Small'  => 365,
        'Medium' => 270,
        'Large'  => 180,
    ];
    private const GRACE = 30;

    public function run(): void
    {
        $today = Carbon::now();

        $cases = [
            // ---------------------------------------------------- Small farms
            [
                'owner' => ['first_name' => 'Teresita', 'last_name' => 'Panganiban', 'mobile_number' => '0931 204 5511'],
                'farm'  => ['farm_name' => "Panganiban Backyard Farm", 'barangay' => 'Bagong Pook', 'farm_size' => 'Small', 'lat' => 13.9012, 'lng' => 121.0872],
                'case'  => 'normal',
            ],
            [
                'owner' => ['first_name' => 'Ariel', 'last_name' => 'Ocampo', 'mobile_number' => '0931 204 5512'],
                'farm'  => ['farm_name' => "Ocampo's Small Layer Farm", 'barangay' => 'Aguila', 'farm_size' => 'Small', 'lat' => 13.8551, 'lng' => 121.1043],
                'case'  => 'upcoming',
            ],
            [
                'owner' => ['first_name' => 'Grace', 'last_name' => 'Del Rosario', 'mobile_number' => '0931 204 5513'],
                'farm'  => ['farm_name' => 'Del Rosario Poultry', 'barangay' => 'Anus', 'farm_size' => 'Small', 'lat' => 13.8482, 'lng' => 121.0918],
                'case'  => 'grace',
            ],
            [
                'owner' => ['first_name' => 'Wilfredo', 'last_name' => 'Sison', 'mobile_number' => '0931 204 5514'],
                'farm'  => ['farm_name' => 'Sison Egg Farm', 'barangay' => 'Balagtasin II', 'farm_size' => 'Small', 'lat' => 13.8901, 'lng' => 121.0958],
                'case'  => 'just_overdue',
            ],
            [
                'owner' => ['first_name' => 'Corazon', 'last_name' => 'Mendoza', 'mobile_number' => '0931 204 5515'],
                'farm'  => ['farm_name' => 'Mendoza Free-Range Layers', 'barangay' => 'Banay-banay I', 'farm_size' => 'Small', 'lat' => 13.8843, 'lng' => 121.1129],
                'case'  => 'severe',
            ],

            // --------------------------------------------------- Medium farms
            [
                'owner' => ['first_name' => 'Bienvenido', 'last_name' => 'Castillo', 'mobile_number' => '0931 204 5516'],
                'farm'  => ['farm_name' => 'Castillo Poultry Farm', 'barangay' => 'Bigain II', 'farm_size' => 'Medium', 'lat' => 13.8759, 'lng' => 121.0919],
                'case'  => 'normal',
            ],
            [
                'owner' => ['first_name' => 'Susana', 'last_name' => 'Lopez', 'mobile_number' => '0931 204 5517'],
                'farm'  => ['farm_name' => 'Lopez Egg Producers', 'barangay' => 'Bigain South', 'farm_size' => 'Medium', 'lat' => 13.8697, 'lng' => 121.0942],
                'case'  => 'upcoming',
            ],
            [
                'owner' => ['first_name' => 'Ernesto', 'last_name' => 'Fernandez', 'mobile_number' => '0931 204 5518'],
                'farm'  => ['farm_name' => 'Fernandez Layer Farm', 'barangay' => 'Calansayan', 'farm_size' => 'Medium', 'lat' => 13.9088, 'lng' => 121.0801],
                'case'  => 'grace',
            ],
            [
                'owner' => ['first_name' => 'Remedios', 'last_name' => 'Navarro', 'mobile_number' => '0931 204 5519'],
                'farm'  => ['farm_name' => 'Navarro Poultry Supply', 'barangay' => 'Lalayat', 'farm_size' => 'Medium', 'lat' => 13.8615, 'lng' => 121.0673],
                'case'  => 'just_overdue',
            ],
            [
                'owner' => ['first_name' => 'Alfonso', 'last_name' => 'Domingo', 'mobile_number' => '0931 204 5520'],
                'farm'  => ['farm_name' => 'Domingo Egg Farm', 'barangay' => 'Lapolapo II', 'farm_size' => 'Medium', 'lat' => 13.8593, 'lng' => 121.1067],
                'case'  => 'severe',
            ],

            // ---------------------------------------------------- Large farms
            [
                'owner' => ['first_name' => 'Priscilla', 'last_name' => 'Bautista', 'mobile_number' => '0931 204 5521'],
                'farm'  => ['farm_name' => 'Bautista Commercial Layers', 'barangay' => 'Lepote', 'farm_size' => 'Large', 'lat' => 13.8447, 'lng' => 121.0839],
                'case'  => 'normal',
            ],
            [
                'owner' => ['first_name' => 'Gregorio', 'last_name' => 'Salazar', 'mobile_number' => '0931 204 5522'],
                'farm'  => ['farm_name' => 'Salazar Poultry Enterprise', 'barangay' => 'Mojon-Tampoy', 'farm_size' => 'Large', 'lat' => 13.8798, 'lng' => 121.0796],
                'case'  => 'upcoming',
            ],
            [
                'owner' => ['first_name' => 'Leticia', 'last_name' => 'Ignacio', 'mobile_number' => '0931 204 5523'],
                'farm'  => ['farm_name' => 'Ignacio Layer Farm', 'barangay' => 'Palanca', 'farm_size' => 'Large', 'lat' => 13.8934, 'lng' => 121.1092],
                'case'  => 'grace',
            ],
            [
                'owner' => ['first_name' => 'Rodrigo', 'last_name' => 'Espino', 'mobile_number' => '0931 204 5524'],
                'farm'  => ['farm_name' => 'Espino Egg Farm', 'barangay' => 'Poblacion Barangay I', 'farm_size' => 'Large', 'lat' => 13.8790, 'lng' => 121.0989],
                'case'  => 'just_overdue',
            ],
            [
                'owner' => ['first_name' => 'Victoria', 'last_name' => 'Marquez', 'mobile_number' => '0931 204 5525'],
                'farm'  => ['farm_name' => 'Marquez Poultry Complex', 'barangay' => 'Santo Cristo', 'farm_size' => 'Large', 'lat' => 13.8676, 'lng' => 121.0865],
                'case'  => 'severe',
            ],
        ];

        foreach ($cases as $c) {
            $intervalDays = self::INTERVAL[$c['farm']['farm_size']];

            $performedAt = match ($c['case']) {
                'normal'       => $today->copy()->subDays((int) round($intervalDays * 0.08)),
                'upcoming'     => $today->copy()->subDays($intervalDays - 10),
                'grace'        => $today->copy()->subDays($intervalDays + 15),
                'just_overdue' => $today->copy()->subDays($intervalDays + self::GRACE + 15),
                'severe'       => $today->copy()->subDays($intervalDays + self::GRACE + 180),
            };

            $user = User::firstOrCreate(
                ['mobile_number' => $c['owner']['mobile_number']],
                [
                    'first_name' => $c['owner']['first_name'],
                    'last_name'  => $c['owner']['last_name'],
                    'password'   => Hash::make('password'),
                    'role'       => 'farm_owner',
                    'status'     => 'active',
                ]
            );

            $farm = Farm::firstOrCreate(
                ['user_id' => $user->id],
                [
                    'farm_name'     => $c['farm']['farm_name'],
                    'owner_name'    => $c['owner']['first_name'] . ' ' . $c['owner']['last_name'],
                    'mobile_number' => $c['owner']['mobile_number'],
                    'barangay'      => $c['farm']['barangay'],
                    'address'       => 'Brgy. ' . $c['farm']['barangay'] . ', San Jose, Batangas',
                    'latitude'      => $c['farm']['lat'],
                    'longitude'     => $c['farm']['lng'],
                    'farm_size'     => $c['farm']['farm_size'],
                    'status'        => 'Active',
                ]
            );

            if (is_null($farm->latitude) || is_null($farm->longitude)) {
                $farm->update([
                    'latitude'  => $c['farm']['lat'],
                    'longitude' => $c['farm']['lng'],
                ]);
            }

            MaintenanceLog::firstOrCreate(
                ['farm_id' => $farm->id, 'performed_at' => $performedAt->toDateString()],
                [
                    'maintenance_type' => 'Full Manure Clean-out',
                    'notes'            => "Seeded test record — {$c['case']} case for a {$c['farm']['farm_size']} farm.",
                    'photo_path'       => 'maintenance/seed-placeholder.jpg',
                ]
            );
        }

        $neverLoggedOwner = User::firstOrCreate(
            ['mobile_number' => '0931 204 5526'],
            [
                'first_name' => 'Herminia',
                'last_name'  => 'Aguilar',
                'password'   => Hash::make('password'),
                'role'       => 'farm_owner',
                'status'     => 'active',
            ]
        );

        $neverLoggedFarm = Farm::firstOrCreate(
            ['user_id' => $neverLoggedOwner->id],
            [
                'farm_name'     => 'Aguilar Poultry Farm',
                'owner_name'    => 'Herminia Aguilar',
                'mobile_number' => '0931 204 5526',
                'barangay'      => 'Tugtug',
                'address'       => 'Brgy. Tugtug, San Jose, Batangas',
                'latitude'      => 13.8508,
                'longitude'     => 121.1015,
                'farm_size'     => 'Medium',
                'status'        => 'Active',
            ]
        );

        if (is_null($neverLoggedFarm->latitude) || is_null($neverLoggedFarm->longitude)) {
            $neverLoggedFarm->update(['latitude' => 13.8508, 'longitude' => 121.1015]);
        }

        DB::table('farms')
            ->where('id', $neverLoggedFarm->id)
            ->update(['created_at' => $today->copy()->subDays(400)]);
    }
}