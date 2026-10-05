<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\ServiceRequest;

class ServiceRequestSeeder extends Seeder
{
    public function run(): void
    {
        // The four legacy "Vaccine Request" demo rows (SR-1011, SR-1009,
        // SR-1012, SR-1008) were removed when that service type was retired;
        // seeding must not recreate them.
        $requests = [
            [
                'request_number' => 'SR-1010',
                'farm_id'        => 2,
                'requested_by'   => 4, // Maria Dela Cruz (farm owner)
                'accepted_by'    => null,
                'service_type'   => 'Odor Control Request',
                'notes'          => 'High ammonia levels detected.',
                'status'         => 'Pending',
                'priority'       => 'Critical',
                'scheduled_at'   => null,
            ],
        ];

        foreach ($requests as $request) {
            ServiceRequest::create($request);
        }
    }
}
