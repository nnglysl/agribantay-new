<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Models\Farm;

class AdditionalFarmSeeder extends Seeder
{
    public function run(): void
    {
        $newOwners = [
            [
                'first_name'    => 'Marcus Neo',
                'last_name'     => 'Rangel',
                'mobile_number' => '0929 407 7940',
                'farm_name'     => "Neo's Farm",
                'barangay'      => 'Banay-banay II',
                'address'       => 'Brgy. Banay-banay II, San Jose, Batangas',
                'latitude'      => 13.8865,
                'longitude'     => 121.1105,
                'farm_size'     => 'Medium',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Joshua Rhey',
                'last_name'     => 'Magbanua',
                'mobile_number' => '0992 772 4857',
                'farm_name'     => 'Magbanua Poultry Farm',
                'barangay'      => 'Pinagtung-Ulan',
                'address'       => 'Brgy. Pinagtung-Ulan, San Jose, Batangas',
                'latitude'      => 13.9045,
                'longitude'     => 121.0765,
                'farm_size'     => 'Small',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Elena',
                'last_name'     => 'Villaruel',
                'mobile_number' => '0917 345 6789',
                'farm_name'     => 'Villaruel Egg Farm',
                'barangay'      => 'Taysan',
                'address'       => 'Brgy. Taysan, San Jose, Batangas',
                'latitude'      => 13.8590,
                'longitude'     => 121.0525,
                'farm_size'     => 'Large',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Roberto',
                'last_name'     => 'Manalo',
                'mobile_number' => '0918 234 5678',
                'farm_name'     => 'Manalo Poultry & Livestock',
                'barangay'      => 'Sabang',
                'address'       => 'Brgy. Sabang, San Jose, Batangas',
                'latitude'      => 13.8760,
                'longitude'     => 121.1180,
                'farm_size'     => 'Medium',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Carmela',
                'last_name'     => 'Torres',
                'mobile_number' => '0919 456 7890',
                'farm_name'     => 'Torres Layer Farm',
                'barangay'      => 'Aya',
                'address'       => 'Brgy. Aya, San Jose, Batangas',
                'latitude'      => 13.8710,
                'longitude'     => 121.0890,
                'farm_size'     => 'Small',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Danilo',
                'last_name'     => 'Cruz',
                'mobile_number' => '0920 567 8901',
                'farm_name'     => 'Cruz Egg Producers',
                'barangay'      => 'Dagatan',
                'address'       => 'Brgy. Dagatan, San Jose, Batangas',
                'latitude'      => 13.8935,
                'longitude'     => 121.0940,
                'farm_size'     => 'Medium',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Michelle',
                'last_name'     => 'Ramos',
                'mobile_number' => '0921 678 9012',
                'farm_name'     => 'Ramos Poultry House',
                'barangay'      => 'Lapolapo I',
                'address'       => 'Brgy. Lapolapo I, San Jose, Batangas',
                'latitude'      => 13.8620,
                'longitude'     => 121.1035,
                'farm_size'     => 'Small',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Ferdinand',
                'last_name'     => 'Aquino',
                'mobile_number' => '0922 789 0123',
                'farm_name'     => 'Aquino Free-Range Farm',
                'barangay'      => 'Natunuan',
                'address'       => 'Brgy. Natunuan, San Jose, Batangas',
                'latitude'      => 13.8830,
                'longitude'     => 121.0700,
                'farm_size'     => 'Large',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Isabel',
                'last_name'     => 'Garcia',
                'mobile_number' => '0923 890 1234',
                'farm_name'     => 'Garcia Poultry Supply',
                'barangay'      => 'Galamay-Amo',
                'address'       => 'Brgy. Galamay-Amo, San Jose, Batangas',
                'latitude'      => 13.8790,
                'longitude'     => 121.1150,
                'farm_size'     => 'Medium',
                'status'        => 'Active',
            ],
            [
                'first_name'    => 'Nestor',
                'last_name'     => 'Villanueva',
                'mobile_number' => '0924 901 2345',
                'farm_name'     => 'Villanueva Layer Farm',
                'barangay'      => 'Salaban',
                'address'       => 'Brgy. Salaban, San Jose, Batangas',
                'latitude'      => 13.8670,
                'longitude'     => 121.0810,
                'farm_size'     => 'Small',
                'status'        => 'Deactivated',
            ],
        ];

        foreach ($newOwners as $owner) {
            $user = User::firstOrCreate(
                ['mobile_number' => $owner['mobile_number']],
                [
                    'first_name' => $owner['first_name'],
                    'last_name'  => $owner['last_name'],
                    'password'   => Hash::make('password'),
                    'role'       => 'farm_owner',
                    'status'     => 'active',
                ]
            );

            Farm::firstOrCreate(
                ['user_id' => $user->id],
                [
                    'farm_name'     => $owner['farm_name'],
                    'owner_name'    => $owner['first_name'] . ' ' . $owner['last_name'],
                    'mobile_number' => $owner['mobile_number'],
                    'barangay'      => $owner['barangay'],
                    'address'       => $owner['address'],
                    'latitude'      => $owner['latitude'],
                    'longitude'     => $owner['longitude'],
                    'farm_size'     => $owner['farm_size'],
                    'status'        => $owner['status'],
                ]
            );
        }
    }
}