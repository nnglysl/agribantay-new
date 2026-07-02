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
            'first_name'    => 'LGU',
            'last_name'     => 'Administrator',
            'email'         => 'admin@agribantay.gov.ph',
            'mobile_number' => '0917 000 0000',
            'password'      => Hash::make('password'),
            'role'          => 'admin',
            'status'        => 'active',
        ]);

        User::create([
            'first_name'    => 'Ramon',
            'last_name'     => 'Santos',
            'email'         => 'ramon@agribantay.gov.ph',
            'mobile_number' => '0917 123 4567',
            'password'      => Hash::make('password'),
            'role'          => 'farm_owner',
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
    }
}