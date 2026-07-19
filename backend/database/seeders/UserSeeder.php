<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        User::create([
            'first_name'    => 'System',
            'last_name'     => 'Super Admin',
            'email'         => 'superadmin@agribantay.gov.ph',
            'mobile_number' => '0917 999 9999',
            'password'      => Hash::make('password'),
            'role'          => 'super_admin',
            'status'        => 'active',
        ]);

        User::create([
            'first_name'    => 'LGU',
            'last_name'     => 'Administrator',
            'email'         => 'admin@agribantay.gov.ph',
            'mobile_number' => '0917 000 0000',
            'password'      => Hash::make('password'),
            'role'          => 'admin',
            'status'        => 'active',
        ]);

        User::create([
            'first_name'    => 'Dr. Andrea',
            'last_name'     => 'Reyes',
            'email'         => 'andreareyes@agribantay.gov.ph',
            'mobile_number' => '0917 563 0121',
            'password'      => Hash::make('password'),
            'role'          => 'vet',
            'status'        => 'active',
        ]);

        $farmOwners = [
            ['first_name' => 'Ramon', 'last_name' => 'Santos',    'mobile_number' => '0917 123 4567'],
            ['first_name' => 'Maria', 'last_name' => 'Dela Cruz', 'mobile_number' => '0917 222 3344'],
            ['first_name' => 'Jose',  'last_name' => 'Bautista',  'mobile_number' => '0918 555 7890'],
            ['first_name' => 'Liza',  'last_name' => 'Reyes',     'mobile_number' => '0919 888 1212'],
        ];

        foreach ($farmOwners as $owner) {
            User::create([
                'first_name'    => $owner['first_name'],
                'last_name'     => $owner['last_name'],
                'mobile_number' => $owner['mobile_number'],
                'password'      => Hash::make('password'),
                'role'          => 'farm_owner',
                'status'        => 'active',
            ]);
        }
    }
}