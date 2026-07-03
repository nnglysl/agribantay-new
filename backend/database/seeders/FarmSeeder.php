<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Farm;
use App\Models\PoultryHouse;
use App\Models\User;

class FarmSeeder extends Seeder
{
    public function run(): void
    {
        $farms = [
            [
                'owner_email_or_number' => '0917 123 4567',
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
                'owner_email_or_number' => '0917 222 3344',
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
                'owner_email_or_number' => '0918 555 7890',
                'farm_name'   => 'Bautista Poultry Farm',
                'owner_name'  => 'Jose Bautista',
                'mobile_number' => '0918 555 7890',
                'barangay'    => 'Brgy. Bagumbayan',
                'address'     => 'Brgy. Bagumbayan, San Jose, Batangas',
                'num_birds'   => 1800,
                'farm_size'   => 'Small',
                'status'      => 'Active',
            ],
            [
                'owner_email_or_number' => '0919 888 1212',
                'farm_name'   => 'Reyes Layer Farm',
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
            $user = User::where('mobile_number', $farmData['owner_email_or_number'])->first();

            $farm = Farm::create([
                'user_id'       => $user?->id,
                'farm_name'     => $farmData['farm_name'],
                'owner_name'    => $farmData['owner_name'],
                'mobile_number' => $farmData['mobile_number'],
                'barangay'      => $farmData['barangay'],
                'address'       => $farmData['address'],
                'num_birds'     => $farmData['num_birds'],
                'farm_size'     => $farmData['farm_size'],
                'status'        => $farmData['status'],
            ]);

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