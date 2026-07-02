<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\ServiceRequest;

class ServiceRequestSeeder extends Seeder
{
    public function run(): void
    {
        $requests = [
            [
                'request_number' => 'SR-1011',
                'farm_id'        => 1,
                'requested_by'   => 2,
                'assigned_to'    => 3,
                'service_type'   => 'Vaccine Request',
                'notes'          => 'Newcastle disease vaccine needed.',
                'status'         => 'Scheduled',
                'priority'       => 'High',
                'scheduled_at'   => now()->addDays(2),
            ],
            [
                'request_number' => 'SR-1010',
                'farm_id'        => 2,
                'requested_by'   => 2,
                'assigned_to'    => null,
                'service_type'   => 'Odor Control Request',
                'notes'          => 'High ammonia levels detected.',
                'status'         => 'Pending',
                'priority'       => 'Critical',
                'scheduled_at'   => null,
            ],
            [
                'request_number' => 'SR-1009',
                'farm_id'        => 1,
                'requested_by'   => 2,
                'assigned_to'    => 3,
                'service_type'   => 'Vaccine Request',
                'notes'          => 'Routine vaccination schedule.',
                'status'         => 'Completed',
                'priority'       => 'Medium',
                'scheduled_at'   => now()->subDays(5),
                'completed_at'   => now()->subDays(3),
            ],
        ];

        foreach ($requests as $request) {
            ServiceRequest::create($request);
        }
    }
}