<?php

namespace Tests\Support;

use PDO;

/** Synthetic transaction harness, not an application assignment/ingestion replacement. */
final class MariaDbHouseOperations
{
    public static function event(PDO $pdo, int $sensor, ?int $farm, ?int $house): int
    {
        $old = $pdo->query('SELECT * FROM sensors WHERE id='.$sensor)->fetch();
        $pdo->exec("INSERT INTO activity_logs(user_id,role,type,action,details,created_at) VALUES(2,'admin','Farm','Synthetic move','Phase 8 synthetic evidence',NOW())");
        $activity = (int) $pdo->lastInsertId();
        $q = $pdo->prepare('INSERT INTO device_assignment_events(sensor_id,activity_log_id,from_farm_id,to_farm_id,
            from_house_id,to_house_id,from_house_number,to_house_number,from_farm_name,to_farm_name,event_kind,
            reading_floor_id,alert_floor_id,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,
            (SELECT COALESCE(MAX(id),0) FROM sensor_readings WHERE sensor_id=?),
            (SELECT COALESCE(MAX(id),0) FROM alert_history WHERE sensor_id=?),NOW())');
        $number = function ($id) use ($pdo) {
            $value = $id ? $pdo->query('SELECT house_number FROM poultry_houses WHERE id='.(int) $id)->fetchColumn() : null;

            return $value === false ? null : $value;
        };
        $q->execute([$sensor, $activity, $old['farm_id'], $farm, $old['poultry_house_id'], $house,
            $number($old['poultry_house_id']), $number($house), 'Synthetic previous', $farm ? 'Synthetic next' : null,
            $farm ? 'house_assignment' : 'unassignment', $sensor, $sensor]);

        return (int) $pdo->lastInsertId();
    }

    public static function assign(PDO $pdo, int $sensor, ?int $farm, ?int $house): int
    {
        $pdo->query('SELECT id FROM sensors WHERE id='.$sensor.' FOR UPDATE')->fetch();
        $event = self::event($pdo, $sensor, $farm, $house);
        $q = $pdo->prepare('UPDATE sensors SET farm_id=?,poultry_house_id=?,current_assignment_event_id=? WHERE id=?');
        $q->execute([$farm, $house, $house ? $event : null, $sensor]);

        return $event;
    }

    public static function ingest(PDO $pdo, int $sensor): int
    {
        $row = $pdo->query('SELECT * FROM sensors WHERE id='.$sensor.' FOR UPDATE')->fetch();
        if (! $row['farm_id'] || $row['status'] !== 'Active') {
            throw new \RuntimeException('Synthetic ingestion requires an Active assigned device.');
        }
        $q = $pdo->prepare('INSERT INTO sensor_readings(farm_id,sensor_id,poultry_house_id,assignment_event_id,ammonia,temperature,humidity,moisture,created_at) VALUES(?,?,?,?,1,28,60,40,NOW())');
        $q->execute([$row['farm_id'], $sensor, $row['poultry_house_id'], $row['current_assignment_event_id']]);

        return (int) $pdo->lastInsertId();
    }
}
