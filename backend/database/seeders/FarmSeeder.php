<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Farm;
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
                'barangay'    => 'Balagtasin I',
                'address'     => 'Brgy. Balagtasin I, San Jose, Batangas',
                'latitude'    => 13.8824,
                'longitude'   => 121.1012,
                'farm_size'   => 'Medium',
                'status'      => 'Active',
            ],
            [
                'owner_email_or_number' => '0917 222 3344',
                'farm_name'   => 'Dela Cruz Layer Farm',
                'owner_name'  => 'Maria Dela Cruz',
                'mobile_number' => '0917 222 3344',
                'barangay'    => 'Bigain I',
                'address'     => 'Brgy. Bigain I, San Jose, Batangas',
                'latitude'    => 13.8783,
                'longitude'   => 121.0965,
                'farm_size'   => 'Medium',
                'status'      => 'Active',
            ],
            [
                'owner_email_or_number' => '0918 555 7890',
                'farm_name'   => 'Bautista Poultry Farm',
                'owner_name'  => 'Jose Bautista',
                'mobile_number' => '0918 555 7890',
                'barangay'    => 'Don Luis',
                'address'     => 'Brgy. Don Luis, San Jose, Batangas',
                'latitude'    => 13.8705,
                'longitude'   => 121.1080,
                'farm_size'   => 'Small',
                'status'      => 'Active',
            ],
            [
                'owner_email_or_number' => '0919 888 1212',
                'farm_name'   => 'Reyes Layer Farm',
                'owner_name'  => 'Liza Reyes',
                'mobile_number' => '0919 888 1212',
                'barangay'    => 'Lumil',
                'address'     => 'Brgy. Lumil, San Jose, Batangas',
                'latitude'    => 13.8648,
                'longitude'   => 121.1000,
                'farm_size'   => 'Small',
                'status'      => 'Deactivated',
            ],
        ];

        foreach ($farms as $farmData) {
            $user = User::where('mobile_number', $farmData['owner_email_or_number'])->first();

            Farm::create([
                'user_id'       => $user?->id,
                'farm_name'     => $farmData['farm_name'],
                'owner_name'    => $farmData['owner_name'],
                'mobile_number' => $farmData['mobile_number'],
                'barangay'      => $farmData['barangay'],
                'address'       => $farmData['address'],
                'latitude'      => $farmData['latitude'],
                'longitude'     => $farmData['longitude'],
                'farm_size'     => $farmData['farm_size'],
                'status'        => $farmData['status'],
            ]);
        }
    }
}