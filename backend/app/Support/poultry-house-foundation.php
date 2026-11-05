<?php

// Shared runtime structural contract; never executes migrations.
return [
    'columns' => [
        'farms' => ['last_house_number', 'house_inventory_verified_at'],
        'device_assignment_events' => ['from_house_id', 'to_house_id', 'from_house_number', 'to_house_number', 'from_farm_name', 'to_farm_name', 'event_kind'],
        'sensors' => ['poultry_house_id', 'current_assignment_event_id', 'active_house_slot'],
        'sensor_readings' => ['poultry_house_id', 'assignment_event_id', 'measurement_context'],
        'alert_history' => ['poultry_house_id', 'assignment_event_id'],
    ],
    // table, columns, unique, first installation unit
    'indexes' => [
        'ph_farm_number_uq' => ['poultry_houses', 'farm_id,house_number', true, 1],
        'ph_farm_request_uq' => ['poultry_houses', 'farm_id,creation_request_id', true, 1],
        'ph_farm_id_uq' => ['poultry_houses', 'farm_id,id', true, 1],
        'phi_farm_uq' => ['poultry_house_initializations', 'farm_id', true, 1],
        'ph_farm_status_number_idx' => ['poultry_houses', 'farm_id,status,house_number', false, 1],
        'phi_operation_idx' => ['poultry_house_initializations', 'operation_id', false, 1],
        'dae_device_context_uq' => ['device_assignment_events', 'id,sensor_id,to_farm_id,to_house_id', true, 2],
        'dae_house_context_uq' => ['device_assignment_events', 'id,to_farm_id,to_house_id', true, 2],
        'dae_sensor_event_idx' => ['device_assignment_events', 'sensor_id,id', false, 2],
        'dae_house_event_idx' => ['device_assignment_events', 'to_house_id,id', false, 2],
        'sensors_active_house_uq' => ['sensors', 'active_house_slot', true, 3],
        'sr_house_period_time_idx' => ['sensor_readings', 'farm_id,poultry_house_id,assignment_event_id,created_at,id', false, 4],
        'sr_device_period_time_idx' => ['sensor_readings', 'sensor_id,assignment_event_id,created_at,id', false, 4],
        'ah_house_incident_idx' => ['alert_history', 'farm_id,poultry_house_id,sensor_id,assignment_event_id,sensor_type,resolved_at', false, 4],
        'ah_house_time_idx' => ['alert_history', 'poultry_house_id,triggered_at,id', false, 4],
    ],
    // child table/columns, parent table/columns, first unit; every action RESTRICT.
    'foreign_keys' => [
        'poultry_houses_farm_id_foreign' => ['poultry_houses', 'farm_id', 'farms', 'id', 1],
        'sensors_house_membership_fk' => ['sensors', 'farm_id,poultry_house_id', 'poultry_houses', 'farm_id,id', 3],
        'sensors_assignment_context_fk' => ['sensors', 'current_assignment_event_id,id,farm_id,poultry_house_id', 'device_assignment_events', 'id,sensor_id,to_farm_id,to_house_id', 3],
        'sr_house_membership_fk' => ['sensor_readings', 'farm_id,poultry_house_id', 'poultry_houses', 'farm_id,id', 4],
        'sr_assignment_house_fk' => ['sensor_readings', 'assignment_event_id,farm_id,poultry_house_id', 'device_assignment_events', 'id,to_farm_id,to_house_id', 4],
        'sr_assignment_device_fk' => ['sensor_readings', 'assignment_event_id,sensor_id,farm_id,poultry_house_id', 'device_assignment_events', 'id,sensor_id,to_farm_id,to_house_id', 4],
        'ah_house_membership_fk' => ['alert_history', 'farm_id,poultry_house_id', 'poultry_houses', 'farm_id,id', 4],
        'ah_assignment_house_fk' => ['alert_history', 'assignment_event_id,farm_id,poultry_house_id', 'device_assignment_events', 'id,to_farm_id,to_house_id', 4],
        'ah_assignment_device_fk' => ['alert_history', 'assignment_event_id,sensor_id,farm_id,poultry_house_id', 'device_assignment_events', 'id,sensor_id,to_farm_id,to_house_id', 4],
    ],
    'checks' => [
        'ph_number_positive' => ['(house_number > 0)', 1],
        'phi_registration_count' => ["((source <> 'registration') OR (initial_house_count > 0))", 1],
        'sensors_house_context_ck' => ['(((poultry_house_id IS NULL) AND (current_assignment_event_id IS NULL)) OR ((poultry_house_id IS NOT NULL) AND (current_assignment_event_id IS NOT NULL)))', 3],
        'sr_house_context_ck' => ['(((poultry_house_id IS NULL) AND (assignment_event_id IS NULL)) OR ((poultry_house_id IS NOT NULL) AND (assignment_event_id IS NOT NULL)))', 4],
        'ah_house_context_ck' => ['(((poultry_house_id IS NULL) AND (assignment_event_id IS NULL)) OR ((poultry_house_id IS NOT NULL) AND (assignment_event_id IS NOT NULL)))', 4],
    ],
    // Trigger bodies are read from these exact hash-verified source statements.
    'triggers' => [
        'ph_identity_immutable_bu' => ['poultry_houses', 'UPDATE', 1, 'CREATE TRIGGER ph_identity_immutable_bu'],
        'sensors_house_context_bi' => ['sensors', 'INSERT', 3, 'CREATE TRIGGER sensors_house_context_'],
        'sensors_house_context_bu' => ['sensors', 'UPDATE', 3, 'CREATE TRIGGER sensors_house_context_'],
        'ph_deactivation_unassigned_bu' => ['poultry_houses', 'UPDATE', 3, 'CREATE TRIGGER ph_deactivation_unassigned_bu'],
    ],
];
