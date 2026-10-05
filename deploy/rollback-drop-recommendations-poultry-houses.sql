-- ---------------------------------------------------------------------------
-- UNDO the migration 2026_10_04_120000_drop_recommendations_and_poultry_houses.
--
-- ONLY RUN THIS IF SOMETHING BROKE after that migration. It is not part of the
-- deployment. On a normal, working deploy this file is never opened.
--
-- WHY IT EXISTS: Hostinger has no SSH, so `php artisan migrate:rollback` cannot
-- be typed anywhere. Restoring the whole database backup would work, but it
-- would also wipe the Overdue Maintenance seeding, so this undoes ONLY the
-- drop.
--
-- The CREATE TABLE statements below are copied from SHOW CREATE TABLE on a
-- database where the migration had been rolled back by the framework itself --
-- they are what Laravel builds, not what anyone remembered.
--
-- Rows are NOT restored, because there were none: both tables held 0 rows and
-- every poultry_house_id was NULL when the migration ran.
--
-- AFTER RUNNING THIS, put the old backend files back too (Recommendation.php,
-- PoultryHouse.php, RecommendationController.php and the six edited files).
-- The schema alone does not undo the code.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

-- STEP 1 -- the two tables -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `poultry_houses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `farm_id` bigint unsigned NOT NULL,
  `house_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity` int NOT NULL DEFAULT '0',
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `poultry_houses_farm_id_foreign` (`farm_id`),
  CONSTRAINT `poultry_houses_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `recommendations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `farm_id` bigint unsigned NOT NULL,
  `type` enum('Ventilation Improvement','Litter Management','Equipment Check','Community Alert') COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` enum('Priority','Routine','Scheduled','Regional') COLLATE utf8mb4_unicode_ci NOT NULL,
  `root_cause` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `preventive_action` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `suggested_next_step` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `recommendations_farm_id_foreign` (`farm_id`),
  CONSTRAINT `recommendations_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- STEP 2 -- the two pointing columns ------------------------------------------
-- The delete rules differ and are reproduced as they were: a sensor survives
-- its house (SET NULL), a reading was set to go with it (CASCADE on the farm
-- side), so they are not interchangeable.
ALTER TABLE `sensors`
  ADD COLUMN `poultry_house_id` bigint unsigned NULL AFTER `farm_id`,
  ADD KEY `sensors_poultry_house_id_foreign` (`poultry_house_id`),
  ADD CONSTRAINT `sensors_poultry_house_id_foreign`
      FOREIGN KEY (`poultry_house_id`) REFERENCES `poultry_houses` (`id`) ON DELETE SET NULL;

ALTER TABLE `sensor_readings`
  ADD COLUMN `poultry_house_id` bigint unsigned NULL AFTER `sensor_id`,
  ADD KEY `sensor_readings_poultry_house_id_foreign` (`poultry_house_id`),
  ADD CONSTRAINT `sensor_readings_poultry_house_id_foreign`
      FOREIGN KEY (`poultry_house_id`) REFERENCES `poultry_houses` (`id`) ON DELETE SET NULL;

-- STEP 3 -- tell Laravel the migration is no longer applied ---------------------
-- Without this the framework still believes it ran, and would refuse to run it
-- again after the problem is fixed.
DELETE FROM `migrations`
 WHERE `migration` = '2026_10_04_120000_drop_recommendations_and_poultry_houses_tables';

-- STEP 4 -- confirm ------------------------------------------------------------
SELECT 'poultry_houses table'            AS item, COUNT(*) AS present FROM information_schema.TABLES  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'poultry_houses'
UNION ALL SELECT 'recommendations table',        COUNT(*) FROM information_schema.TABLES  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recommendations'
UNION ALL SELECT 'sensors.poultry_house_id',     COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sensors'         AND COLUMN_NAME = 'poultry_house_id'
UNION ALL SELECT 'sensor_readings.poultry_house_id', COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sensor_readings' AND COLUMN_NAME = 'poultry_house_id'
UNION ALL SELECT 'migration row removed (want 0)', COUNT(*) FROM `migrations` WHERE `migration` = '2026_10_04_120000_drop_recommendations_and_poultry_houses_tables';
