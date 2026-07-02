<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\SensorReading;

class SensorReadingSeeder extends Seeder
{
    public function run(): void
    {
        $readings = [
            [
                'farm_id'            => 1,
                'poultry_house_id'   => 1,
                'ammonia'            => 9,
                'temperature'        => 29,
                'humidity'           => 61,
                'moisture'           => 45,
                'ammonia_status'     => 'Normal',
                'temperature_status' => 'Normal',
                'humidity_status'    => 'Normal',
                'moisture_status'    => 'Normal',
                'is_mock'            => true,
            ],
            [
                'farm_id'            => 2,
                'poultry_house_id'   => 3,
                'ammonia'            => 38,
                'temperature'        => 35,
                'humidity'           => 80,
                'moisture'           => 72,
                'ammonia_status'     => 'Critical',
                'temperature_status' => 'Warning',
                'humidity_status'    => 'Warning',
                'moisture_status'    => 'Warning',
                'is_mock'            => true,
            ],
            [
                'farm_id'            => 3,
                'poultry_house_id'   => 5,
                'ammonia'            => 22,
                'temperature'        => 31,
                'humidity'           => 68,
                'moisture'           => 55,
                'ammonia_status'     => 'Warning',
                'temperature_status' => 'Normal',
                'humidity_status'    => 'Normal',
                'moisture_status'    => 'Normal',
                'is_mock'            => true,
            ],
            [
                'farm_id'            => 4,
                'poultry_house_id'   => 7,
                'ammonia'            => 12,
                'temperature'        => 28,
                'humidity'           => 58,
                'moisture'           => 40,
                'ammonia_status'     => 'Normal',
                'temperature_status' => 'Normal',
                'humidity_status'    => 'Normal',
                'moisture_status'    => 'Normal',
                'is_mock'            => true,
            ],
        ];

        foreach ($readings as $reading) {
            SensorReading::create($reading);
        }
    }
}