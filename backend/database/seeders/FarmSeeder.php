<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Farm;
use App\Models\PoultryHouse;

class FarmSeeder extends Seeder
{
    public function run(): void
    {
        $farms = [
            [
                'user_id'     => 2,
                'farm_name'   => 'Santos Poultry Farm',
                'owner_name'  => 'Ramon Santos',
                'mobile_number' => '0917 123 4567',
                'barangay'    => 'Brgy. San Roque',
                'address'     => 'Brgy. San Roque, San Jose, Batangas',
                'num_birds'   => 5200,
                'farm_size'   => 'Semi-Commercial',
                'status'      => 'Active',
            ],
            [
                'user_id'     => 2,
                'farm_name'   => 'Dela Cruz Layer Farm',
                'owner_name'  => 'Maria Dela Cruz',
                'mobile_number' => '0917 222 3344',
                'barangay'    => 'Brgy. Sta. Cruz',
                'address'     => 'Brgy. Sta. Cruz, San Jose, Batangas',
                'num_birds'   => 5800,
                'farm_size'   => 'Semi-Commercial',
                'status'      => 'Active',
            ],
            [
                'user_id'     => 2,
                'farm_name'   => 'Bautista Broiler Farm',
                'owner_name'  => 'Jose Bautista',
                'mobile_number' => '0918 555 7890',
                'barangay'    => 'Brgy. Bagumbayan',
                'address'     => 'Brgy. Bagumbayan, San Jose, Batangas',
                'num_birds'   => 1800,
                'farm_size'   => 'Small',
                'status'      => 'Active',
            ],
            [
                'user_id'     => 2,
                'farm_name'   => 'Reyes Free-Range Farm',
                'owner_name'  => 'Liza Reyes',
                'mobile_number' => '0919 888 1212',
                'barangay'    => 'Brgy. San Isidro',
                'address'     => 'Brgy. San Isidro, San Jose, Batangas',
                'num_birds'   => 900,
                'farm_size'   => 'Small',
                'status'      => 'Deactivated',
            ],
        ];

        foreach ($farms as $farmData) {
            $farm = Farm::create($farmData);

            // Create 2 poultry houses per farm
            PoultryHouse::create([
                'farm_id'    => $farm->id,
                'house_name' => 'House A',
                'capacity'   => intval($farm->num_birds / 2),
                'status'     => 'Active',
            ]);
            PoultryHouse::create([
                'farm_id'    => $farm->id,
                'house_name' => 'House B',
                'capacity'   => intval($farm->num_birds / 2),
                'status'     => 'Active',
            ]);
        }
    }
}