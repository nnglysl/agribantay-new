<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Inspection;

class InspectionSeeder extends Seeder
{
    public function run(): void
    {
        $inspections = [
            // Upcoming / scheduled inspections
            [
                'inspection_number' => 'INS-1001',
                'farm_id'           => 2, // Dela Cruz Layer Farm — critical ammonia, ties into the alert
                'assigned_to'       => 1, // LGU Administrator
                'inspection_type'   => 'Follow-up',
                'notes'             => 'Follow-up inspection triggered by critical ammonia reading.',
                'findings'          => null,
                'status'            => 'Scheduled',
                'scheduled_at'      => now()->addDay()->setTime(9, 0),
                'completed_at'      => null,
            ],
            [
                'inspection_number' => 'INS-1002',
                'farm_id'           => 3, // Bautista Poultry Farm
                'assigned_to'       => 1,
                'inspection_type'   => 'General Inspection',
                'notes'             => 'Routine quarterly inspection.',
                'findings'          => null,
                'status'            => 'Scheduled',
                'scheduled_at'      => now()->addDays(3)->setTime(10, 30),
                'completed_at'      => null,
            ],
            [
                'inspection_number' => 'INS-1003',
                'farm_id'           => 1, // Santos Poultry Farm
                'assigned_to'       => 1,
                'inspection_type'   => 'General Inspection',
                'notes'             => 'First inspection since registration.',
                'findings'          => null,
                'status'            => 'Scheduled',
                'scheduled_at'      => now()->addDays(5)->setTime(14, 0),
                'completed_at'      => null,
            ],

            // Completed inspections (recent history for Reports trend chart)
            [
                'inspection_number' => 'INS-0996',
                'farm_id'           => 1,
                'assigned_to'       => 1,
                'inspection_type'   => 'General Inspection',
                'notes'             => 'Routine inspection.',
                'findings'          => 'All systems normal. Manure management compliant. No violations observed.',
                'status'            => 'Completed',
                'scheduled_at'      => now()->subDays(10)->setTime(9, 0),
                'completed_at'      => now()->subDays(10)->setTime(10, 15),
            ],
            [
                'inspection_number' => 'INS-0994',
                'farm_id'           => 3,
                'assigned_to'       => 1,
                'inspection_type'   => 'General Inspection',
                'notes'             => 'Routine inspection.',
                'findings'          => 'Minor ventilation issue noted, owner advised to improve airflow. Re-check on next visit.',
                'status'            => 'Completed',
                'scheduled_at'      => now()->subDays(18)->setTime(11, 0),
                'completed_at'      => now()->subDays(18)->setTime(12, 0),
            ],
            [
                'inspection_number' => 'INS-0989',
                'farm_id'           => 2,
                'assigned_to'       => 1,
                'inspection_type'   => 'Follow-up',
                'notes'             => 'Follow-up on prior ammonia warning.',
                'findings'          => 'Ammonia levels still elevated. Owner instructed to increase litter turnover frequency. Scheduled for re-inspection.',
                'status'            => 'Completed',
                'scheduled_at'      => now()->subDays(30)->setTime(9, 30),
                'completed_at'      => now()->subDays(30)->setTime(10, 45),
            ],
            [
                'inspection_number' => 'INS-0981',
                'farm_id'           => 4,
                'assigned_to'       => 1,
                'inspection_type'   => 'General Inspection',
                'notes'             => 'Routine inspection prior to deactivation.',
                'findings'          => 'Farm inactive at time of visit. No birds present.',
                'status'            => 'Completed',
                'scheduled_at'      => now()->subDays(45)->setTime(13, 0),
                'completed_at'      => now()->subDays(45)->setTime(13, 40),
            ],

            // Cancelled inspection (for History tab variety)
            [
                'inspection_number' => 'INS-0992',
                'farm_id'           => 3,
                'assigned_to'       => 1,
                'inspection_type'   => 'Follow-up',
                'notes'             => 'Owner requested reschedule due to unavailability.',
                'findings'          => null,
                'status'            => 'Cancelled',
                'scheduled_at'      => now()->subDays(20)->setTime(9, 0),
                'completed_at'      => null,
            ],
        ];

        foreach ($inspections as $inspection) {
            Inspection::create($inspection);
        }
    }
}