-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: db_agribantay
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `role` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `details` text COLLATE utf8mb4_unicode_ci,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `activity_logs_user_id_foreign` (`user_id`),
  CONSTRAINT `activity_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
INSERT INTO `activity_logs` VALUES (1,NULL,'System','Critical alert triggered','Dela Cruz Layer Farm — Critical','Alert',NULL,'2026-07-12 16:49:03','2026-07-12 16:49:03'),(2,NULL,'System','Moderate alert triggered','Bautista Poultry Farm — Moderate','Alert',NULL,'2026-07-12 16:49:04','2026-07-12 16:49:04'),(3,1,'admin','Created Farm Owner Account','Created account for Joshua Magbanua — Rhey\'s Farm','Account',NULL,'2026-07-12 19:12:00','2026-07-12 19:12:00'),(4,1,'admin','Added Farm to Existing Owner','Joana\'s Farm — Joshua Magbanua','Farm',NULL,'2026-07-14 21:56:46','2026-07-14 21:56:46'),(5,1,'admin','Created Veterinarian Account','Created vet account for Joana Marie Briones ()','Account',NULL,'2026-07-14 22:23:22','2026-07-14 22:23:22'),(6,1,'admin','Deactivated Veterinarian Account','Deactivated: Joana Marie Briones','Account',NULL,'2026-07-15 21:37:18','2026-07-15 21:37:18'),(7,17,'farm_owner','Submitted vaccine request','SR-1005 — Rhey\'s Farm','Request',NULL,'2026-07-15 21:37:49','2026-07-15 21:37:49'),(8,17,'farm_owner','Submitted odor control request','SR-1006 — Rhey\'s Farm','Request',NULL,'2026-07-15 21:38:12','2026-07-15 21:38:12'),(9,2,'vet','Scheduled vaccination','SR-1005 — Rhey\'s Farm','Vaccination',NULL,'2026-07-15 21:39:10','2026-07-15 21:39:10'),(10,1,'admin','Scheduled Inspection','Scheduled inspection INS-009','Inspection',NULL,'2026-07-15 23:27:16','2026-07-15 23:27:16'),(11,1,'admin','Created Farm Owner Account','Created owner account for Glysel Anne Sales','Account',NULL,'2026-07-15 23:44:15','2026-07-15 23:44:15'),(12,NULL,'System','Moderate alert triggered','Santos Poultry Farm — Moderate','Alert',NULL,'2026-07-19 15:42:06','2026-07-19 15:42:06'),(13,NULL,'System','Status recovered','Dela Cruz Layer Farm — Safe','Alert',NULL,'2026-07-19 15:42:07','2026-07-19 15:42:07'),(14,NULL,'System','Status recovered','Bautista Poultry Farm — Safe','Alert',NULL,'2026-07-19 15:42:07','2026-07-19 15:42:07'),(15,NULL,'System','Moderate alert triggered','Reyes Layer Farm — Moderate','Alert',NULL,'2026-07-19 15:42:08','2026-07-19 15:42:08'),(16,1,'admin','Created Farm Owner Account','Created owner account for Marcus Rangel','Account',NULL,'2026-07-19 19:01:46','2026-07-19 19:01:46'),(17,3,'farm_owner','Submitted odor control request','SR-1007 — Santos Poultry Farm','Request',NULL,'2026-07-19 21:22:04','2026-07-19 21:22:04'),(18,3,'farm_owner','Submitted vaccine request','SR-1013 — Santos Poultry Farm','Request',NULL,'2026-07-20 14:53:19','2026-07-20 14:53:19'),(19,3,'farm_owner','Submitted blood test request','SR-1014 — Santos Poultry Farm','Request',NULL,'2026-07-20 14:53:30','2026-07-20 14:53:30'),(20,3,'farm_owner','Submitted odor control request','SR-1015 — Santos Poultry Farm','Request',NULL,'2026-07-20 14:53:42','2026-07-20 14:53:42'),(21,3,'farm_owner','Submitted fly control request','SR-1016 — Santos Poultry Farm','Request',NULL,'2026-07-20 14:53:54','2026-07-20 14:53:54'),(22,2,'vet','Scheduled vaccination','SR-1013 — Santos Poultry Farm','Vaccination',NULL,'2026-07-20 15:19:31','2026-07-20 15:19:31'),(23,2,'vet','Completed vaccination','SR-1011 — Santos Poultry Farm','Vaccination',NULL,'2026-07-20 15:20:13','2026-07-20 15:20:13'),(24,1,'admin','Created Farm Owner Account','Created owner account for Joana Marie Briones','Account',NULL,'2026-07-20 23:25:59','2026-07-20 23:25:59'),(25,1,'admin','Added Farm to Existing Owner','Hernan\'s Farm — Joana Marie Briones','Farm',NULL,'2026-07-21 00:04:02','2026-07-21 00:04:02'),(26,NULL,'System','Critical alert triggered','Hernan\'s Farm — Critical','Alert',NULL,'2026-07-21 00:23:41','2026-07-21 00:23:41'),(27,1,'admin','Scheduled Service Request','Fly Control Request — Santos Poultry Farm','Service',NULL,'2026-07-21 05:21:11','2026-07-21 05:21:11');
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `alert_history`
--

DROP TABLE IF EXISTS `alert_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alert_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `farm_id` bigint unsigned NOT NULL,
  `sensor_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` double NOT NULL,
  `triggered_at` timestamp NOT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `alert_history_farm_id_sensor_type_resolved_at_index` (`farm_id`,`sensor_type`,`resolved_at`),
  CONSTRAINT `alert_history_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alert_history`
--

LOCK TABLES `alert_history` WRITE;
/*!40000 ALTER TABLE `alert_history` DISABLE KEYS */;
INSERT INTO `alert_history` VALUES (1,1,'ammonia','Warning',25.7,'2026-07-18 11:04:24',NULL,'2026-07-20 00:12:48','2026-07-20 00:12:48'),(2,1,'humidity','Warning',70.4,'2026-07-18 23:04:24',NULL,'2026-07-20 00:12:48','2026-07-20 00:12:48'),(3,1,'temperature','Warning',33.1,'2026-07-19 03:04:24',NULL,'2026-07-20 00:12:48','2026-07-20 00:12:48'),(4,1,'moisture','Warning',60.3,'2026-07-19 03:04:24',NULL,'2026-07-20 00:12:48','2026-07-20 00:12:48'),(5,2,'ammonia','Critical',38,'2026-07-12 16:48:27','2026-07-17 19:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(6,2,'temperature','Warning',35,'2026-07-12 16:48:27','2026-07-17 19:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(7,2,'humidity','Warning',80,'2026-07-12 16:48:27','2026-07-17 19:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(8,2,'moisture','Warning',72,'2026-07-12 16:48:27','2026-07-17 19:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(9,3,'ammonia','Warning',22,'2026-07-12 16:48:27','2026-07-18 15:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(10,3,'humidity','Warning',75.1,'2026-07-17 19:04:24','2026-07-18 11:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(11,4,'humidity','Warning',72,'2026-07-17 23:04:24','2026-07-18 03:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(12,4,'temperature','Warning',32.2,'2026-07-18 03:04:24','2026-07-18 07:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(13,4,'humidity','Warning',72.6,'2026-07-18 11:04:24','2026-07-18 15:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(14,4,'ammonia','Warning',26.3,'2026-07-18 15:04:24','2026-07-18 19:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(15,4,'ammonia','Warning',26.2,'2026-07-18 23:04:24',NULL,'2026-07-20 00:12:48','2026-07-20 00:12:48'),(16,4,'temperature','Warning',32.4,'2026-07-18 23:04:24','2026-07-19 03:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(17,4,'moisture','Warning',60,'2026-07-18 23:04:24','2026-07-19 03:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(18,4,'humidity','Warning',71.8,'2026-07-19 03:04:24','2026-07-19 07:04:24','2026-07-20 00:12:48','2026-07-20 00:12:48'),(19,17,'ammonia','Critical',48.84,'2026-07-21 00:23:41',NULL,'2026-07-21 00:23:41','2026-07-21 00:23:41'),(20,17,'humidity','Warning',70,'2026-07-21 00:23:41',NULL,'2026-07-21 00:23:41','2026-07-21 00:23:41'),(21,17,'moisture','Warning',63.37,'2026-07-21 00:23:41',NULL,'2026-07-21 00:23:41','2026-07-21 00:23:41');
/*!40000 ALTER TABLE `alert_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache`
--

DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache`
--

LOCK TABLES `cache` WRITE;
/*!40000 ALTER TABLE `cache` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache_locks`
--

DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache_locks`
--

LOCK TABLES `cache_locks` WRITE;
/*!40000 ALTER TABLE `cache_locks` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache_locks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `failed_jobs`
--

DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failed_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `failed_jobs`
--

LOCK TABLES `failed_jobs` WRITE;
/*!40000 ALTER TABLE `failed_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `failed_jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `farms`
--

DROP TABLE IF EXISTS `farms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `farms` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `device_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` bigint unsigned NOT NULL,
  `farm_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mobile_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `barangay` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `municipality` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'San Jose',
  `province` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Batangas',
  `address` text COLLATE utf8mb4_unicode_ci,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `farm_size` enum('Small','Medium','Large') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Active','Inactive','Deactivated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `current_status` enum('Safe','Moderate','Critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Safe',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `farms_device_key_unique` (`device_key`),
  KEY `farms_user_id_foreign` (`user_id`),
  CONSTRAINT `farms_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `farms`
--

LOCK TABLES `farms` WRITE;
/*!40000 ALTER TABLE `farms` DISABLE KEYS */;
INSERT INTO `farms` VALUES (1,NULL,3,'Santos Poultry Farm','Ramon Santos','0917 123 4567','Balagtasin I','San Jose','Batangas','Brgy. Balagtasin I, San Jose, Batangas',13.8824000,121.1012000,'Medium','Active','Moderate','2026-07-12 16:48:27','2026-07-19 15:42:04'),(2,NULL,4,'Dela Cruz Layer Farm','Maria Dela Cruz','0917 222 3344','Bigain I','San Jose','Batangas','Brgy. Bigain I, San Jose, Batangas',13.8783000,121.0965000,'Medium','Active','Safe','2026-07-20 16:36:03','2026-07-19 15:42:06'),(3,NULL,5,'Bautista Poultry Farm','Jose Bautista','0918 555 7890','Don Luis','San Jose','Batangas','Brgy. Don Luis, San Jose, Batangas',13.8705000,121.1080000,'Small','Active','Safe','2026-07-12 16:48:27','2026-07-19 15:42:07'),(4,NULL,6,'Reyes Layer Farm','Liza Reyes','0919 888 1212','Lumil','San Jose','Batangas','Brgy. Lumil, San Jose, Batangas',13.8648000,121.1000000,'Small','Active','Moderate','2026-07-12 16:48:27','2026-07-19 15:42:07'),(5,NULL,7,'Neo\'s Farm','Marcus Neo Rangel','0929 407 7940','Banay-banay II','San Jose','Batangas','Brgy. Banay-banay II, San Jose, Batangas',13.8865000,121.1105000,'Medium','Active','Safe','2026-07-12 19:04:41','2026-07-12 19:04:41'),(6,NULL,8,'Magbanua Poultry Farm','Joshua Rhey Magbanua','0992 772 4857','Pinagtung-Ulan','San Jose','Batangas','Brgy. Pinagtung-Ulan, San Jose, Batangas',13.9045000,121.0765000,'Small','Active','Safe','2026-07-12 19:04:41','2026-07-12 19:04:41'),(7,NULL,9,'Villaruel Egg Farm','Elena Villaruel','0917 345 6789','Taysan','San Jose','Batangas','Brgy. Taysan, San Jose, Batangas',13.8590000,121.0525000,'Large','Active','Safe','2026-07-12 19:04:41','2026-07-12 19:04:41'),(8,NULL,10,'Manalo Poultry & Livestock','Roberto Manalo','0918 234 5678','Sabang','San Jose','Batangas','Brgy. Sabang, San Jose, Batangas',13.8760000,121.1180000,'Medium','Active','Safe','2026-07-12 19:04:42','2026-07-12 19:04:42'),(9,NULL,11,'Torres Layer Farm','Carmela Torres','0919 456 7890','Aya','San Jose','Batangas','Brgy. Aya, San Jose, Batangas',13.8710000,121.0890000,'Small','Active','Safe','2026-07-12 19:04:42','2026-07-12 19:04:42'),(10,NULL,12,'Cruz Egg Producers','Danilo Cruz','0920 567 8901','Dagatan','San Jose','Batangas','Brgy. Dagatan, San Jose, Batangas',13.8935000,121.0940000,'Medium','Active','Safe','2026-07-12 19:04:43','2026-07-12 19:04:43'),(11,NULL,13,'Ramos Poultry House','Michelle Ramos','0921 678 9012','Lapolapo I','San Jose','Batangas','Brgy. Lapolapo I, San Jose, Batangas',13.8620000,121.1035000,'Small','Active','Safe','2026-07-12 19:04:43','2026-07-12 19:04:43'),(12,NULL,14,'Aquino Free-Range Farm','Ferdinand Aquino','0922 789 0123','Natunuan','San Jose','Batangas','Brgy. Natunuan, San Jose, Batangas',13.8830000,121.0700000,'Large','Active','Safe','2026-07-12 19:04:43','2026-07-12 19:04:43'),(13,NULL,15,'Garcia Poultry Supply','Isabel Garcia','0923 890 1234','Galamay-Amo','San Jose','Batangas','Brgy. Galamay-Amo, San Jose, Batangas',13.8790000,121.1150000,'Medium','Active','Safe','2026-07-12 19:04:44','2026-07-12 19:04:44'),(14,NULL,16,'Villanueva Layer Farm','Nestor Villanueva','0924 901 2345','Salaban','San Jose','Batangas','Brgy. Salaban, San Jose, Batangas',13.8670000,121.0810000,'Small','Deactivated','Safe','2026-07-12 19:04:44','2026-07-12 19:04:44'),(15,NULL,17,'Rhey\'s Farm','Joshua Magbanua','09927724857','Balagtasin I','San Jose','Batangas','Balagtasin I, San Jose, Batangas, Philippines',13.8926323,121.0879263,'Medium','Active','Safe','2026-07-12 19:12:00','2026-07-12 19:12:00'),(16,NULL,17,'Joana\'s Farm','Joshua Magbanua','09927724857','Pinagtung-Ulan','San Jose','Batangas','Pinagtung-Ulan, San Jose, Batangas, Philippines',13.9202727,121.0824452,'Medium','Active','Safe','2026-07-14 21:56:46','2026-07-14 21:56:46'),(17,NULL,23,'Hernan\'s Farm','Joana Marie Briones','09661472252','Pinagtung-Ulan','San Jose','Batangas','Pinagtung-Ulan, San Jose, Batangas, Philippines (near espeña chapel)',13.9246698,121.0849751,'Small','Active','Critical','2026-07-21 00:04:02','2026-07-21 00:23:41');
/*!40000 ALTER TABLE `farms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspections`
--

DROP TABLE IF EXISTS `inspections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspections` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `inspection_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_id` bigint unsigned NOT NULL,
  `assigned_to` bigint unsigned DEFAULT NULL,
  `inspection_type` enum('General Inspection','Follow-up') COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `findings` text COLLATE utf8mb4_unicode_ci,
  `status` enum('Scheduled','Completed','Cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Scheduled',
  `scheduled_at` datetime NOT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inspections_inspection_number_unique` (`inspection_number`),
  KEY `inspections_farm_id_foreign` (`farm_id`),
  KEY `inspections_assigned_to_foreign` (`assigned_to`),
  CONSTRAINT `inspections_assigned_to_foreign` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `inspections_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspections`
--

LOCK TABLES `inspections` WRITE;
/*!40000 ALTER TABLE `inspections` DISABLE KEYS */;
INSERT INTO `inspections` VALUES (1,'INS-1001',2,1,'Follow-up','Follow-up inspection triggered by critical ammonia reading.',NULL,'Scheduled','2026-07-14 09:00:00',NULL,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(2,'INS-1002',3,1,'General Inspection','Routine quarterly inspection.',NULL,'Scheduled','2026-07-16 10:30:00',NULL,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(3,'INS-1003',1,1,'General Inspection','First inspection since registration.',NULL,'Scheduled','2026-07-18 14:00:00',NULL,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(4,'INS-0996',1,1,'General Inspection','Routine inspection.','All systems normal. Manure management compliant. No violations observed.','Completed','2026-07-03 09:00:00','2026-07-03 10:15:00','2026-07-12 16:48:27','2026-07-12 16:48:27'),(5,'INS-0994',3,1,'General Inspection','Routine inspection.','Minor ventilation issue noted, owner advised to improve airflow. Re-check on next visit.','Completed','2026-06-25 11:00:00','2026-06-25 12:00:00','2026-07-12 16:48:27','2026-07-12 16:48:27'),(6,'INS-0989',2,1,'Follow-up','Follow-up on prior ammonia warning.','Ammonia levels still elevated. Owner instructed to increase litter turnover frequency. Scheduled for re-inspection.','Completed','2026-06-13 09:30:00','2026-06-13 10:45:00','2026-07-12 16:48:27','2026-07-12 16:48:27'),(7,'INS-0981',4,1,'General Inspection','Routine inspection prior to deactivation.','Farm inactive at time of visit. No birds present.','Completed','2026-05-29 13:00:00','2026-05-29 13:40:00','2026-07-12 16:48:27','2026-07-12 16:48:27'),(8,'INS-0992',3,1,'Follow-up','Owner requested reschedule due to unavailability.',NULL,'Cancelled','2026-06-23 09:00:00',NULL,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(10,'INS-009',16,NULL,'Follow-up','test',NULL,'Scheduled','2026-07-15 09:00:00',NULL,'2026-07-15 23:27:16','2026-07-15 23:27:16');
/*!40000 ALTER TABLE `inspections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `job_batches`
--

DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` mediumtext COLLATE utf8mb4_unicode_ci,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_batches`
--

LOCK TABLES `job_batches` WRITE;
/*!40000 ALTER TABLE `job_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `job_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` tinyint unsigned NOT NULL,
  `reserved_at` int unsigned DEFAULT NULL,
  `available_at` int unsigned NOT NULL,
  `created_at` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `maintenance_logs`
--

DROP TABLE IF EXISTS `maintenance_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `farm_id` bigint unsigned NOT NULL,
  `maintenance_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Full Manure Clean-out',
  `performed_at` date NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `photo_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `maintenance_logs_farm_id_performed_at_index` (`farm_id`,`performed_at`),
  CONSTRAINT `maintenance_logs_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `maintenance_logs`
--

LOCK TABLES `maintenance_logs` WRITE;
/*!40000 ALTER TABLE `maintenance_logs` DISABLE KEYS */;
INSERT INTO `maintenance_logs` VALUES (1,1,'Full Manure Clean-out','2026-07-20','Test clean-out log','maintenance/8DyjXfnxR9g8novQ92vnZ3npJlSiZRsrkZThaWiZ.png','2026-07-20 07:38:29','2026-07-20 07:38:29');
/*!40000 ALTER TABLE `maintenance_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `manure_disposal_records`
--

DROP TABLE IF EXISTS `manure_disposal_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `manure_disposal_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `farm_id` bigint unsigned NOT NULL,
  `disposal_method` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(8,2) NOT NULL,
  `buyer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `disposal_date` date NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `manure_disposal_records_farm_id_disposal_date_index` (`farm_id`,`disposal_date`),
  CONSTRAINT `manure_disposal_records_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `manure_disposal_records`
--

LOCK TABLES `manure_disposal_records` WRITE;
/*!40000 ALTER TABLE `manure_disposal_records` DISABLE KEYS */;
INSERT INTO `manure_disposal_records` VALUES (1,1,'Sold',200.00,'Mang Rudy','2026-07-20','Test disposal record','2026-07-20 08:34:39','2026-07-20 08:34:39');
/*!40000 ALTER TABLE `manure_disposal_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2026_07_01_202447_create_personal_access_tokens_table',1),(5,'2026_07_01_210302_create_farms_table',1),(6,'2026_07_01_210310_create_poultry_houses_table',1),(7,'2026_07_01_210317_create_sensor_readings_table',1),(8,'2026_07_01_210324_create_service_requests_table',1),(9,'2026_07_01_210339_create_recommendations_table',1),(10,'2026_07_01_210345_create_activity_logs_table',1),(11,'2026_07_01_210353_create_notifications_table',1),(12,'2026_07_02_211257_make_email_nullable_on_users_table',1),(13,'2026_07_02_215813_add_must_change_password_to_users_table',1),(14,'2026_07_02_220059_add_current_status_to_farms_table',1),(15,'2026_07_02_220121_create_sms_logs_table',1),(16,'2026_07_02_222622_add_unique_constraint_to_mobile_number_on_users_table',1),(17,'2026_07_04_055720_add_device_key_to_farms_table',1),(18,'2026_07_08_083806_add_coordinates_to_farms_table',1),(19,'2026_07_08_094641_create_inspections_table',1),(20,'2026_07_08_110457_remove_num_birds_from_farms_table',1),(21,'2026_07_08_214007_update_farm_size_enum_on_farms_table',1),(22,'2026_07_15_000000_add_email_username_to_users_table',2),(23,'2026_07_18_000000_create_sensors_table',3),(24,'2026_07_20_000000_add_sensor_code_to_sensors_table',3),(25,'2026_07_21_000000_add_super_admin_environmental_roles',3),(26,'2026_07_22_000000_remove_environmental_role',4),(27,'2026_07_22_000000_create_alert_history_table',5),(28,'2026_07_23_000000_create_maintenance_logs_table',6),(29,'2026_07_24_000000_create_manure_disposal_records_table',7),(30,'2026_07_20_224026_change_service_type_to_varchar',8),(31,'2026_07_21_131900_change_activity_log_type_to_varchar',9);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('Sensor Alert','Request Update','Vet Assigned','Inspection Completed','System') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'System',
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_user_id_foreign` (`user_id`),
  CONSTRAINT `notifications_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_tokens`
--

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `personal_access_tokens`
--

DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenable_id` bigint unsigned NOT NULL,
  `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `abilities` text COLLATE utf8mb4_unicode_ci,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`),
  KEY `personal_access_tokens_expires_at_index` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=88 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `personal_access_tokens`
--

LOCK TABLES `personal_access_tokens` WRITE;
/*!40000 ALTER TABLE `personal_access_tokens` DISABLE KEYS */;
INSERT INTO `personal_access_tokens` VALUES (1,'App\\Models\\User',1,'auth_token','7c5244cfbf4f8705b015201bcfdaeb9fc971e7d5ca85f38588b58aab0ef1b95e','[\"*\"]','2026-07-12 16:56:16',NULL,'2026-07-12 16:48:57','2026-07-12 16:56:16'),(2,'App\\Models\\User',2,'auth_token','e8109fc177e7b7750a96b8884dd9e4ff61a7dee80e6016e4303e92e3679ffabd','[\"*\"]','2026-07-12 18:15:01',NULL,'2026-07-12 16:56:28','2026-07-12 18:15:01'),(3,'App\\Models\\User',1,'auth_token','814905e5bf57dff4c4024a8ad86aa2e5f5ab4e990067fe4fed527f451bce6e6c','[\"*\"]','2026-07-12 18:15:43',NULL,'2026-07-12 18:15:38','2026-07-12 18:15:43'),(4,'App\\Models\\User',2,'auth_token','370caa4c0099ea9064af3574fcddbda92015b2e9d2dff641f340866c60fca2e8','[\"*\"]','2026-07-12 18:38:17',NULL,'2026-07-12 18:20:58','2026-07-12 18:38:17'),(5,'App\\Models\\User',1,'auth_token','1b1dc5a07336110b66eea0c2fc0a53fa085b1a50c61ae00ded2c3133ae95d6a1','[\"*\"]','2026-07-12 19:04:45',NULL,'2026-07-12 18:38:30','2026-07-12 19:04:45'),(6,'App\\Models\\User',1,'auth_token','ff9c48c992f139a5f9f4fa3f6385fd6961ed18c6b09b8ef2e865f4183afbac6b','[\"*\"]','2026-07-12 19:12:03',NULL,'2026-07-12 19:10:31','2026-07-12 19:12:03'),(7,'App\\Models\\User',17,'auth_token','91062f1853667099ee1bdfcb4be756b5b38ebce8bddff11894aafb582df50ed8','[\"*\"]','2026-07-12 19:16:01',NULL,'2026-07-12 19:14:27','2026-07-12 19:16:01'),(8,'App\\Models\\User',1,'auth_token','32889550c5d5d0224c90c5f3bb531298145e1ad8340b2e0306ea96b0f6be3625','[\"*\"]','2026-07-12 19:16:16',NULL,'2026-07-12 19:16:13','2026-07-12 19:16:16'),(9,'App\\Models\\User',17,'auth_token','23ccfad25704204957c95df134b6ea183b75c44ee95527bff63ea7b49fcebfc7','[\"*\"]','2026-07-12 19:23:53',NULL,'2026-07-12 19:21:51','2026-07-12 19:23:53'),(10,'App\\Models\\User',1,'auth_token','197dba345e933d2c10eebff2d9c091afc8726f512cd488196d320c892023b55f','[\"*\"]','2026-07-12 19:39:52',NULL,'2026-07-12 19:25:05','2026-07-12 19:39:52'),(11,'App\\Models\\User',17,'auth_token','1e712a597efd28a6454578167bc2fc2da8fedf5ecc83ef67cfcc4555ba97ad6a','[\"*\"]','2026-07-12 19:43:54',NULL,'2026-07-12 19:43:48','2026-07-12 19:43:54'),(12,'App\\Models\\User',2,'auth_token','c169fcc0e80f269abd93a33981f0904ce6869bf2befd9dc1002ae48eba1a09cd','[\"*\"]','2026-07-12 22:00:04',NULL,'2026-07-12 19:48:06','2026-07-12 22:00:04'),(13,'App\\Models\\User',1,'auth_token','e13c238f3392af4e18201c51f7ddd5bc0a6c1e220869823c5dc422b518e93fe1','[\"*\"]','2026-07-13 03:58:53',NULL,'2026-07-12 22:18:52','2026-07-13 03:58:53'),(14,'App\\Models\\User',1,'auth_token','b35d661ed067ddb729f5574c12c8cec245c74a41aff8a0a9c1f090a942fbe6d6','[\"*\"]','2026-07-13 18:44:31',NULL,'2026-07-13 18:31:12','2026-07-13 18:44:31'),(15,'App\\Models\\User',2,'auth_token','dabff60acc380d557d746e5c60c1ec31ea32b5b2a2e29ec138a2920d94bf4086','[\"*\"]','2026-07-13 19:20:03',NULL,'2026-07-13 18:44:47','2026-07-13 19:20:03'),(16,'App\\Models\\User',1,'auth_token','82a49a090332b941972ab72e9c96213f9ef31e7d6c53d5c4a44fb99529cb6f3e','[\"*\"]','2026-07-13 20:45:41',NULL,'2026-07-13 19:32:11','2026-07-13 20:45:41'),(17,'App\\Models\\User',17,'auth_token','c1acdafe80de6843760a9665d6833d369bbecbe863a1521c253c3b7c2327181a','[\"*\"]','2026-07-13 20:50:35',NULL,'2026-07-13 20:49:54','2026-07-13 20:50:35'),(18,'App\\Models\\User',1,'auth_token','9087719d8e5e4ef86e76993d88abfddec09b32fa315446b520eb0cc02f00c0f7','[\"*\"]','2026-07-14 00:20:21',NULL,'2026-07-13 21:00:58','2026-07-14 00:20:21'),(19,'App\\Models\\User',1,'auth_token','fc0a9cb127dd2f026d2099442ed986bbd03f77ab03c51e7efa9b0cb93c79fff7','[\"*\"]','2026-07-14 16:25:04',NULL,'2026-07-14 00:20:20','2026-07-14 16:25:04'),(20,'App\\Models\\User',1,'auth_token','854f0c402b62aacbe5795266bb5e9afbc448fddfcc99727038b592ac737173d8','[\"*\"]','2026-07-14 19:51:05',NULL,'2026-07-14 16:25:14','2026-07-14 19:51:05'),(21,'App\\Models\\User',1,'auth_token','84b53fe48e6c667cd8f2d90b974e52d412246b2cea257b8f47ced22c3ea5cd8e','[\"*\"]','2026-07-14 21:56:52',NULL,'2026-07-14 19:51:04','2026-07-14 21:56:52'),(22,'App\\Models\\User',1,'auth_token','2ce37dda19c29303b8f3504c974411b8c9bc41fd029ef9efe6b62b86d1c36698','[\"*\"]','2026-07-14 22:23:22',NULL,'2026-07-14 22:19:52','2026-07-14 22:23:22'),(23,'App\\Models\\User',18,'auth_token','3614c76f565028fd544a7a2d20a5dab2a496d977699d031c5f4422760e7bf045','[\"*\"]','2026-07-14 22:27:13',NULL,'2026-07-14 22:23:54','2026-07-14 22:27:13'),(24,'App\\Models\\User',1,'auth_token','5c4c2daf3ccdf2f2e82d99bbd483b1f172cfcbdc2c551a6f17a0f5d0e43c8ce3','[\"*\"]','2026-07-15 16:33:54',NULL,'2026-07-14 22:29:42','2026-07-15 16:33:54'),(25,'App\\Models\\User',18,'auth_token','513b632855f4528c6f2596525b8c4861659c70c28d7718f090a58c5d4f927837','[\"*\"]','2026-07-15 16:49:18',NULL,'2026-07-15 16:49:08','2026-07-15 16:49:18'),(26,'App\\Models\\User',17,'auth_token','c66e59d46fbcca0930f6ca3b04b2963d9777303c64b2ddafac588cd2ac459b9f','[\"*\"]','2026-07-15 16:49:32',NULL,'2026-07-15 16:49:29','2026-07-15 16:49:32'),(27,'App\\Models\\User',1,'auth_token','9bb01dd839ed11cb74d73608f49602b30c7894ab61e8b8adeef7e8523b4774f0','[\"*\"]','2026-07-15 16:50:29',NULL,'2026-07-15 16:49:57','2026-07-15 16:50:29'),(28,'App\\Models\\User',18,'auth_token','bbff0627664d9d242cf7ef1f5102d369862e0f07542e1d41c4e727add1811d26','[\"*\"]',NULL,NULL,'2026-07-15 16:50:47','2026-07-15 16:50:47'),(29,'App\\Models\\User',1,'auth_token','2a3051fb07beae76032d8c8d9a1f2c47b3966fe29baeb017e425fc2176da02b5','[\"*\"]',NULL,NULL,'2026-07-15 16:53:45','2026-07-15 16:53:45'),(30,'App\\Models\\User',1,'auth_token','9cfb0296ddd5f8c657252355587621ded21ce741019910d95d60635ac0627b92','[\"*\"]',NULL,NULL,'2026-07-15 16:54:24','2026-07-15 16:54:24'),(31,'App\\Models\\User',1,'auth_token','8738291056822d4efedf6670c178bb5d7d73125d21efe4cad67e9e4273bdd896','[\"*\"]','2026-07-15 20:21:46',NULL,'2026-07-15 20:21:43','2026-07-15 20:21:46'),(32,'App\\Models\\User',17,'auth_token','37f0f884465ee706802f365a0504e7e7847be3540ad6406ac108fd65d372483f','[\"*\"]','2026-07-15 21:36:57',NULL,'2026-07-15 21:36:56','2026-07-15 21:36:57'),(33,'App\\Models\\User',1,'auth_token','9dbe99abb86f90577ebde15499370f8589f818de776625066dae10266003a287','[\"*\"]','2026-07-15 21:37:18',NULL,'2026-07-15 21:37:11','2026-07-15 21:37:18'),(34,'App\\Models\\User',17,'auth_token','afbc6b209cdead7ba5aba8256580a4def648f27b3fadb03c1f22392752a651f3','[\"*\"]','2026-07-15 21:38:13',NULL,'2026-07-15 21:37:28','2026-07-15 21:38:13'),(35,'App\\Models\\User',2,'auth_token','9cc35bd750ec96875d601e4fc136259be5e49b824f9e9066a8b65aca42e946fd','[\"*\"]','2026-07-15 21:39:10',NULL,'2026-07-15 21:38:37','2026-07-15 21:39:10'),(36,'App\\Models\\User',1,'auth_token','af43873ad03f42e2b8b1f9432206d0bd7e4bb39f0cbc8c1a8e2ed6cc80e11214','[\"*\"]','2026-07-15 21:40:48',NULL,'2026-07-15 21:40:22','2026-07-15 21:40:48'),(37,'App\\Models\\User',17,'auth_token','1a73d2d57010afcb5597706bf2e3c7f0620f135cc02af9de024e92b93cb94369','[\"*\"]','2026-07-15 21:41:39',NULL,'2026-07-15 21:41:21','2026-07-15 21:41:39'),(38,'App\\Models\\User',1,'auth_token','338376b41e68160d326857a9d0d829cf6df5faf71573b4f06ea9bfc46ea2c427','[\"*\"]','2026-07-15 23:28:54',NULL,'2026-07-15 23:24:22','2026-07-15 23:28:54'),(39,'App\\Models\\User',2,'auth_token','64d1d6929c8b66548afeb958ece0568ef3eafb3b8fc1d63066f0aae7eaf82da1','[\"*\"]','2026-07-15 23:30:41',NULL,'2026-07-15 23:29:11','2026-07-15 23:30:41'),(40,'App\\Models\\User',17,'auth_token','98ab3c99a890798438fd12b3a73fdfb5cc37b5ada15b22e086060da50ef47991','[\"*\"]','2026-07-15 23:33:09',NULL,'2026-07-15 23:30:51','2026-07-15 23:33:09'),(41,'App\\Models\\User',1,'auth_token','1077fbf18aa7b38ac2374a4e15402c70a0d591c8edad4fad6792cf8aa319f9f3','[\"*\"]','2026-07-15 23:43:58',NULL,'2026-07-15 23:43:41','2026-07-15 23:43:58'),(42,'App\\Models\\User',1,'auth_token','b573c4ac8f6ba14bdcb89e8b71e538595def358f6cbe0c8960cc7c512e333945','[\"*\"]','2026-07-18 04:25:56',NULL,'2026-07-17 07:07:22','2026-07-18 04:25:56'),(43,'App\\Models\\User',1,'auth_token','7b81b90d181896a20c957d7690fff2116edff85a1aa57eaf78275abbe7c1132e','[\"*\"]','2026-07-18 04:35:02',NULL,'2026-07-18 04:34:55','2026-07-18 04:35:02'),(44,'App\\Models\\User',17,'auth_token','6ee470b3133931f1db29cf7f08872b5c76fcd30758c040e5fb28b98f292eafb8','[\"*\"]','2026-07-18 16:52:10',NULL,'2026-07-18 16:51:18','2026-07-18 16:52:10'),(45,'App\\Models\\User',1,'auth_token','9a62c76c15eec0f31fe33d6a40f55abffbb210d4584ed20e5090980382e7d977','[\"*\"]','2026-07-19 01:50:49',NULL,'2026-07-18 17:39:56','2026-07-19 01:50:49'),(46,'App\\Models\\User',20,'auth_token','615f3891674aa190ec68bafafd178b443e1e1d233c543cb9ef7e659cd02a4e64','[\"*\"]','2026-07-19 01:56:18',NULL,'2026-07-19 01:50:57','2026-07-19 01:56:18'),(47,'App\\Models\\User',1,'auth_token','a162124c501733324678f8248787770b9eca03b4192ca4a6f4b9fc36cf2c94d4','[\"*\"]','2026-07-19 01:59:14',NULL,'2026-07-19 01:56:29','2026-07-19 01:59:14'),(48,'App\\Models\\User',20,'auth_token','5623d3ba4a0c1c07dced024e4f906bfc6d1aab2c5b3045e13d48f34cfca4e805','[\"*\"]','2026-07-19 05:56:51',NULL,'2026-07-19 02:01:41','2026-07-19 05:56:51'),(49,'App\\Models\\User',1,'auth_token','566f1f52330b668661ae746039bc92f0649c1ec2c93b3e4a170dcb0bf779b0b2','[\"*\"]','2026-07-19 05:57:16',NULL,'2026-07-19 05:57:01','2026-07-19 05:57:16'),(50,'App\\Models\\User',20,'auth_token','c8f2e42d5a9c0abda348c4851ebafe1f3b35bf4a6e352fbcdc9ccc9a4d793813','[\"*\"]','2026-07-19 06:21:20',NULL,'2026-07-19 05:57:34','2026-07-19 06:21:20'),(51,'App\\Models\\User',20,'auth_token','2f2cde81d7a11dd4e3adc7c5b1c000f2bf12c6b56a2718d4bd2e3af041494b55','[\"*\"]','2026-07-19 06:21:30',NULL,'2026-07-19 06:21:18','2026-07-19 06:21:30'),(52,'App\\Models\\User',17,'auth_token','8b8184c8546c17607a37494ec0b4a2a8f858c7079d5618aeaa741795ecacb61a','[\"*\"]','2026-07-19 06:54:25',NULL,'2026-07-19 06:52:23','2026-07-19 06:54:25'),(53,'App\\Models\\User',20,'auth_token','3e56a42059d4d311ea7c54870a46059155564cdcc045e7fa336eb4d7144bafc0','[\"*\"]','2026-07-19 10:30:54',NULL,'2026-07-19 06:55:24','2026-07-19 10:30:54'),(54,'App\\Models\\User',17,'auth_token','645483f8caecc1e2ab9b8921aefed245e0cbfb19b01d013ea35a2f9fecbe9d8a','[\"*\"]','2026-07-19 15:41:52',NULL,'2026-07-19 07:04:44','2026-07-19 15:41:52'),(55,'App\\Models\\User',20,'auth_token','bd7f94c5a04701d83dbcb211d6419fef306076c3e5874d55deb9116484cc5735','[\"*\"]','2026-07-19 15:43:43',NULL,'2026-07-19 11:09:08','2026-07-19 15:43:43'),(56,'App\\Models\\User',20,'auth_token','9e1427a6428b768611a7b2dfa40cd220d5c1e78171945e461cacb15256f4c9da','[\"*\"]','2026-07-19 15:43:02',NULL,'2026-07-19 15:42:02','2026-07-19 15:43:02'),(57,'App\\Models\\User',17,'auth_token','dbd88d958d3d4d251ebb68738bc25c5ae1d1b0fc904a42dcaad2c078180e8b92','[\"*\"]','2026-07-19 15:45:37',NULL,'2026-07-19 15:45:19','2026-07-19 15:45:37'),(58,'App\\Models\\User',17,'auth_token','37d0d6434606b77671a0b26dfbd9a764d8643302a2e3ff3472bb4d920aade875','[\"*\"]','2026-07-19 15:57:42',NULL,'2026-07-19 15:53:44','2026-07-19 15:57:42'),(59,'App\\Models\\User',3,'auth_token','e2d8f77e7f1f20e34dec4579d3ded094acf8cdb6e4d3f166f2a7063690f50d7f','[\"*\"]','2026-07-19 15:55:04',NULL,'2026-07-19 15:54:43','2026-07-19 15:55:04'),(60,'App\\Models\\User',3,'auth_token','42b172d6c0e2cc84d48ab0e43c6e812020bfb8a3c7df1928b9e5102d9847a3d4','[\"*\"]','2026-07-19 16:57:33',NULL,'2026-07-19 15:58:17','2026-07-19 16:57:33'),(61,'App\\Models\\User',20,'auth_token','398ca83dd7a8f97b535da2694d10f31aa2932d1485f63962cc779964fe542b93','[\"*\"]','2026-07-19 17:03:48',NULL,'2026-07-19 16:58:39','2026-07-19 17:03:48'),(62,'App\\Models\\User',1,'auth_token','2391bda734003e04b4d128ad23f954b3eb4dd7e6a77fca03ba99232f7abd38fe','[\"*\"]','2026-07-19 20:37:17',NULL,'2026-07-19 18:59:30','2026-07-19 20:37:17'),(63,'App\\Models\\User',3,'auth_token','7e5a7689da8bbb30d99fbdb5647e9d62f65b95166eb9436c8081f502042e37b3','[\"*\"]','2026-07-19 21:05:02',NULL,'2026-07-19 20:49:27','2026-07-19 21:05:02'),(64,'App\\Models\\User',3,'auth_token','63eb4fca91296ba33a0332027a72ded64e10a2257d4b1cf483e69b75e0ca84b3','[\"*\"]','2026-07-19 21:23:00',NULL,'2026-07-19 21:18:14','2026-07-19 21:23:00'),(65,'App\\Models\\User',3,'auth_token','029c0f8095b3a9244dd389822333759dd5dce173e2b7851dce4462a4203a9293','[\"*\"]','2026-07-20 02:47:03',NULL,'2026-07-20 02:46:40','2026-07-20 02:47:03'),(66,'App\\Models\\User',3,'auth_token','104f3823dde78ce9e9514e8abf19c06dd384bac6c0bf16331d3bb301bf1aadc1','[\"*\"]','2026-07-20 07:39:00',NULL,'2026-07-20 07:34:39','2026-07-20 07:39:00'),(67,'App\\Models\\User',3,'auth_token','dcfddd84bf8f044087d39b4dafc98ab2b953a8db60feeb509248091246e7d13e','[\"*\"]','2026-07-20 08:06:14',NULL,'2026-07-20 07:41:14','2026-07-20 08:06:14'),(68,'App\\Models\\User',1,'auth_token','92cc39682a7c096780fa782b44d9046157d53dc3e548466b5ea99672d3bf9520','[\"*\"]','2026-07-20 08:07:12',NULL,'2026-07-20 08:06:31','2026-07-20 08:07:12'),(69,'App\\Models\\User',1,'auth_token','8a2394db93b78389176e24e6c75ed0f9dc58c38ed6432d99ecd82fa98e92bbd7','[\"*\"]','2026-07-20 08:21:03',NULL,'2026-07-20 08:17:51','2026-07-20 08:21:03'),(70,'App\\Models\\User',3,'auth_token','1049fe79755bcb663fda3336358d649bb0967335a7913c894701e9f20345ced8','[\"*\"]','2026-07-20 08:35:19',NULL,'2026-07-20 08:32:50','2026-07-20 08:35:19'),(71,'App\\Models\\User',3,'auth_token','05d94b1f7808d93a08b4d74adc20929ece7f644b06081c6f2d31bba40f756abe','[\"*\"]','2026-07-20 08:39:14',NULL,'2026-07-20 08:37:00','2026-07-20 08:39:14'),(72,'App\\Models\\User',1,'auth_token','2018e12256432c13f6ad55506348b9d55e946937dd5065daf6ad817ed65aa006','[\"*\"]','2026-07-20 08:44:35',NULL,'2026-07-20 08:40:01','2026-07-20 08:44:35'),(73,'App\\Models\\User',3,'auth_token','b4aaf4e6354b0ccc12678853f4193ec8c24c9269660a65bfc5d5f2c2a6e11b2f','[\"*\"]','2026-07-20 13:46:13',NULL,'2026-07-20 13:43:05','2026-07-20 13:46:13'),(74,'App\\Models\\User',1,'auth_token','806d68e2f6d07a53b97e43d69e43ef3df9261b8ec1ad907f79950a7a9bd80422','[\"*\"]','2026-07-20 14:02:37',NULL,'2026-07-20 13:46:42','2026-07-20 14:02:37'),(75,'App\\Models\\User',3,'auth_token','bb2e36a6fadb0dfd1a2669a76990447ea911981a325848739c46d95e06119561','[\"*\"]','2026-07-20 15:03:47',NULL,'2026-07-20 14:03:32','2026-07-20 15:03:47'),(76,'App\\Models\\User',2,'auth_token','2221095f9f6262ce66f0d792e7f3acde2002b96f3deca70965c2a0d56791bda6','[\"*\"]','2026-07-20 15:04:20',NULL,'2026-07-20 15:04:19','2026-07-20 15:04:20'),(77,'App\\Models\\User',1,'auth_token','5e725a22cbe9a1ca993a9d02adc3b2c32e54896f1f1d372cef5b4d901c8ca124','[\"*\"]','2026-07-20 15:05:30',NULL,'2026-07-20 15:05:25','2026-07-20 15:05:30'),(78,'App\\Models\\User',2,'auth_token','1a384728522a40b92128fd410a8161617cca522e891252e4287c91e3b8e6d475','[\"*\"]','2026-07-20 19:24:54',NULL,'2026-07-20 15:15:56','2026-07-20 19:24:54'),(79,'App\\Models\\User',1,'auth_token','b14176618d0ad4351a47951e6e93aa49e6f389d4e7e12f0d9508d316e30c6dc9','[\"*\"]','2026-07-20 19:27:14',NULL,'2026-07-20 19:26:14','2026-07-20 19:27:14'),(80,'App\\Models\\User',3,'auth_token','8573dfebe3c451b84610ff4877f1f2c7d2dffaddb14876abf31d642e35c294df','[\"*\"]','2026-07-20 22:42:50',NULL,'2026-07-20 19:29:57','2026-07-20 22:42:50'),(81,'App\\Models\\User',1,'auth_token','45b12e36ae7674bffab339d7f45d87bd71d44f6c7a9aad7c9433fd4149d8023e','[\"*\"]','2026-07-20 23:08:11',NULL,'2026-07-20 22:42:56','2026-07-20 23:08:11'),(82,'App\\Models\\User',20,'auth_token','bc90f9542ace57825997ae7556a76507b52711fadc51bedbfa16a8d75cbff0a2','[\"*\"]','2026-07-20 23:14:46',NULL,'2026-07-20 23:12:49','2026-07-20 23:14:46'),(83,'App\\Models\\User',2,'auth_token','0ca04d2c248bb9649d952d127754f99abc12e5eec24d29e5cde48a935d0f0a6f','[\"*\"]','2026-07-20 23:18:41',NULL,'2026-07-20 23:17:03','2026-07-20 23:18:41'),(84,'App\\Models\\User',3,'auth_token','4d0826525bcb09e62a3b08833fdee5adfd271afd51b1613744da357255b6e1cf','[\"*\"]','2026-07-20 23:22:17',NULL,'2026-07-20 23:19:41','2026-07-20 23:22:17'),(85,'App\\Models\\User',1,'auth_token','83f3eecc5f07329738b8586b892367a792b577019386cc877aa03f58888b5581','[\"*\"]','2026-07-21 04:34:10',NULL,'2026-07-20 23:24:44','2026-07-21 04:34:10'),(86,'App\\Models\\User',1,'auth_token','e966c31fd0df2dc5698ec051bb41ca154d7ac163be9b6f5102b5182161231943','[\"*\"]','2026-07-21 05:21:11',NULL,'2026-07-21 05:17:32','2026-07-21 05:21:11'),(87,'App\\Models\\User',2,'auth_token','670b7d045457811776d7ffa80da75655f87298d41dba51e791c9a1affe788ff1','[\"*\"]','2026-07-21 05:28:15',NULL,'2026-07-21 05:28:09','2026-07-21 05:28:15');
/*!40000 ALTER TABLE `personal_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `poultry_houses`
--

DROP TABLE IF EXISTS `poultry_houses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `poultry_houses` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `poultry_houses`
--

LOCK TABLES `poultry_houses` WRITE;
/*!40000 ALTER TABLE `poultry_houses` DISABLE KEYS */;
/*!40000 ALTER TABLE `poultry_houses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `recommendations`
--

DROP TABLE IF EXISTS `recommendations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recommendations` (
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `recommendations`
--

LOCK TABLES `recommendations` WRITE;
/*!40000 ALTER TABLE `recommendations` DISABLE KEYS */;
INSERT INTO `recommendations` VALUES (1,1,'Ventilation Improvement','Priority','Ammonia levels are trending upward, currently at 34.60ppm across recent readings.','Increase exhaust fan operation and check for blocked vents.','Request a maintenance visit through Service Requests if levels persist.',0,'2026-07-19 15:58:44','2026-07-19 15:58:44'),(2,1,'Litter Management','Routine','Litter moisture has been elevated across recent readings, currently at 63.10%.','Turn and partially replace litter to reduce moisture buildup.','Schedule a litter check before the next inspection visit.',0,'2026-07-19 15:58:44','2026-07-19 15:58:44'),(3,1,'Equipment Check','Scheduled','Temperature readings have been unstable, currently at 33.30°C.','Have the fan and cooling system inspected before the next heat period.','Request a maintenance visit through the Service Requests tab.',0,'2026-07-19 15:58:44','2026-07-19 15:58:44');
/*!40000 ALTER TABLE `recommendations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sensor_readings`
--

DROP TABLE IF EXISTS `sensor_readings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sensor_readings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `farm_id` bigint unsigned NOT NULL,
  `sensor_id` bigint unsigned DEFAULT NULL,
  `poultry_house_id` bigint unsigned DEFAULT NULL,
  `ammonia` decimal(8,2) DEFAULT NULL,
  `temperature` decimal(8,2) DEFAULT NULL,
  `humidity` decimal(8,2) DEFAULT NULL,
  `moisture` decimal(8,2) DEFAULT NULL,
  `ammonia_status` enum('Normal','Warning','Critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Normal',
  `temperature_status` enum('Normal','Warning','Critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Normal',
  `humidity_status` enum('Normal','Warning','Critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Normal',
  `moisture_status` enum('Normal','Warning','Critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Normal',
  `is_mock` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sensor_readings_farm_id_foreign` (`farm_id`),
  KEY `sensor_readings_poultry_house_id_foreign` (`poultry_house_id`),
  KEY `sensor_readings_sensor_id_foreign` (`sensor_id`),
  CONSTRAINT `sensor_readings_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sensor_readings_poultry_house_id_foreign` FOREIGN KEY (`poultry_house_id`) REFERENCES `poultry_houses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sensor_readings_sensor_id_foreign` FOREIGN KEY (`sensor_id`) REFERENCES `sensors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sensor_readings`
--

LOCK TABLES `sensor_readings` WRITE;
/*!40000 ALTER TABLE `sensor_readings` DISABLE KEYS */;
INSERT INTO `sensor_readings` VALUES (1,1,NULL,NULL,9.00,29.00,61.00,45.00,'Normal','Normal','Normal','Normal',1,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(2,2,NULL,NULL,38.00,35.00,80.00,72.00,'Critical','Warning','Warning','Warning',1,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(3,3,NULL,NULL,22.00,31.00,68.00,55.00,'Warning','Normal','Normal','Normal',1,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(4,4,NULL,NULL,12.00,28.00,58.00,40.00,'Normal','Normal','Normal','Normal',1,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(5,1,NULL,NULL,18.80,28.30,61.00,45.70,'Normal','Normal','Normal','Normal',1,'2026-07-17 19:04:24','2026-07-17 19:04:24'),(6,1,NULL,NULL,19.00,28.50,61.30,46.20,'Normal','Normal','Normal','Normal',1,'2026-07-17 23:04:24','2026-07-17 23:04:24'),(7,1,NULL,NULL,20.90,29.20,62.00,49.30,'Normal','Normal','Normal','Normal',1,'2026-07-18 03:04:24','2026-07-18 03:04:24'),(8,1,NULL,NULL,23.80,30.00,64.00,51.90,'Normal','Normal','Normal','Normal',1,'2026-07-18 07:04:24','2026-07-18 07:04:24'),(9,1,NULL,NULL,25.70,30.00,65.50,52.00,'Warning','Normal','Normal','Normal',1,'2026-07-18 11:04:24','2026-07-18 11:04:24'),(10,1,NULL,NULL,27.40,31.00,67.40,54.40,'Warning','Normal','Normal','Normal',1,'2026-07-18 15:04:24','2026-07-18 15:04:24'),(11,1,NULL,NULL,29.30,31.20,68.20,57.10,'Warning','Normal','Normal','Normal',1,'2026-07-18 19:04:24','2026-07-18 19:04:24'),(12,1,NULL,NULL,31.30,32.00,70.40,58.60,'Warning','Normal','Warning','Normal',1,'2026-07-18 23:04:24','2026-07-18 23:04:24'),(13,1,NULL,NULL,32.60,33.10,72.60,60.30,'Warning','Warning','Warning','Warning',1,'2026-07-19 03:04:24','2026-07-19 03:04:24'),(14,1,NULL,NULL,34.60,33.30,74.10,63.10,'Warning','Warning','Warning','Warning',1,'2026-07-19 07:04:24','2026-07-19 07:04:24'),(15,2,NULL,NULL,14.00,26.80,54.00,39.90,'Normal','Normal','Normal','Normal',1,'2026-07-17 19:04:24','2026-07-17 19:04:24'),(16,2,NULL,NULL,16.10,26.50,56.00,39.80,'Normal','Normal','Normal','Normal',1,'2026-07-17 23:04:24','2026-07-17 23:04:24'),(17,2,NULL,NULL,14.60,26.80,53.40,40.80,'Normal','Normal','Normal','Normal',1,'2026-07-18 03:04:24','2026-07-18 03:04:24'),(18,2,NULL,NULL,15.00,26.90,56.50,40.00,'Normal','Normal','Normal','Normal',1,'2026-07-18 07:04:24','2026-07-18 07:04:24'),(19,2,NULL,NULL,16.40,26.80,53.50,39.40,'Normal','Normal','Normal','Normal',1,'2026-07-18 11:04:24','2026-07-18 11:04:24'),(20,2,NULL,NULL,15.80,27.10,53.60,39.00,'Normal','Normal','Normal','Normal',1,'2026-07-18 15:04:24','2026-07-18 15:04:24'),(21,2,NULL,NULL,16.20,26.70,55.70,39.40,'Normal','Normal','Normal','Normal',1,'2026-07-18 19:04:24','2026-07-18 19:04:24'),(22,2,NULL,NULL,15.80,26.60,56.50,38.10,'Normal','Normal','Normal','Normal',1,'2026-07-18 23:04:24','2026-07-18 23:04:24'),(23,2,NULL,NULL,15.00,26.80,57.00,42.00,'Normal','Normal','Normal','Normal',1,'2026-07-19 03:04:24','2026-07-19 03:04:24'),(24,2,NULL,NULL,16.30,26.50,55.90,42.00,'Normal','Normal','Normal','Normal',1,'2026-07-19 07:04:24','2026-07-19 07:04:24'),(25,3,NULL,NULL,31.80,31.10,75.10,58.70,'Warning','Normal','Warning','Normal',1,'2026-07-17 19:04:24','2026-07-17 19:04:24'),(26,3,NULL,NULL,30.80,30.60,73.60,58.00,'Warning','Normal','Warning','Normal',1,'2026-07-17 23:04:24','2026-07-17 23:04:24'),(27,3,NULL,NULL,28.80,30.30,72.50,55.60,'Warning','Normal','Warning','Normal',1,'2026-07-18 03:04:24','2026-07-18 03:04:24'),(28,3,NULL,NULL,27.20,29.90,70.90,55.50,'Warning','Normal','Warning','Normal',1,'2026-07-18 07:04:24','2026-07-18 07:04:24'),(29,3,NULL,NULL,26.40,30.10,69.70,54.90,'Warning','Normal','Normal','Normal',1,'2026-07-18 11:04:24','2026-07-18 11:04:24'),(30,3,NULL,NULL,24.90,29.60,69.00,53.90,'Normal','Normal','Normal','Normal',1,'2026-07-18 15:04:24','2026-07-18 15:04:24'),(31,3,NULL,NULL,23.00,29.30,68.10,51.90,'Normal','Normal','Normal','Normal',1,'2026-07-18 19:04:24','2026-07-18 19:04:24'),(32,3,NULL,NULL,22.20,29.00,66.40,51.20,'Normal','Normal','Normal','Normal',1,'2026-07-18 23:04:24','2026-07-18 23:04:24'),(33,3,NULL,NULL,21.20,28.90,66.00,50.70,'Normal','Normal','Normal','Normal',1,'2026-07-19 03:04:24','2026-07-19 03:04:24'),(34,3,NULL,NULL,18.90,28.20,65.20,48.80,'Normal','Normal','Normal','Normal',1,'2026-07-19 07:04:24','2026-07-19 07:04:24'),(35,4,NULL,NULL,23.90,30.80,67.30,56.70,'Normal','Normal','Normal','Normal',1,'2026-07-17 19:04:24','2026-07-17 19:04:24'),(36,4,NULL,NULL,21.10,29.50,72.00,54.70,'Normal','Normal','Warning','Normal',1,'2026-07-17 23:04:24','2026-07-17 23:04:24'),(37,4,NULL,NULL,23.40,32.20,66.30,50.20,'Normal','Warning','Normal','Normal',1,'2026-07-18 03:04:24','2026-07-18 03:04:24'),(38,4,NULL,NULL,21.60,32.00,68.80,53.70,'Normal','Normal','Normal','Normal',1,'2026-07-18 07:04:24','2026-07-18 07:04:24'),(39,4,NULL,NULL,20.90,31.30,72.60,55.70,'Normal','Normal','Warning','Normal',1,'2026-07-18 11:04:24','2026-07-18 11:04:24'),(40,4,NULL,NULL,26.30,29.70,66.80,59.40,'Warning','Normal','Normal','Normal',1,'2026-07-18 15:04:24','2026-07-18 15:04:24'),(41,4,NULL,NULL,20.40,32.00,67.70,53.80,'Normal','Normal','Normal','Normal',1,'2026-07-18 19:04:24','2026-07-18 19:04:24'),(42,4,NULL,NULL,26.20,32.40,67.00,60.00,'Warning','Warning','Normal','Warning',1,'2026-07-18 23:04:24','2026-07-18 23:04:24'),(43,4,NULL,NULL,27.80,32.00,71.80,52.10,'Warning','Normal','Warning','Normal',1,'2026-07-19 03:04:24','2026-07-19 03:04:24'),(44,4,NULL,NULL,25.60,30.20,65.70,58.80,'Warning','Normal','Normal','Normal',1,'2026-07-19 07:04:24','2026-07-19 07:04:24'),(45,17,1,NULL,48.84,30.00,70.00,63.37,'Critical','Normal','Warning','Warning',0,'2026-07-21 00:23:41','2026-07-21 00:23:41');
/*!40000 ALTER TABLE `sensor_readings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sensors`
--

DROP TABLE IF EXISTS `sensors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sensors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `farm_id` bigint unsigned NOT NULL,
  `poultry_house_id` bigint unsigned DEFAULT NULL,
  `installed_at` date DEFAULT NULL,
  `sensor_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sensors_device_key_unique` (`device_key`),
  UNIQUE KEY `sensors_sensor_code_unique` (`sensor_code`),
  KEY `sensors_farm_id_foreign` (`farm_id`),
  KEY `sensors_poultry_house_id_foreign` (`poultry_house_id`),
  CONSTRAINT `sensors_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sensors_poultry_house_id_foreign` FOREIGN KEY (`poultry_house_id`) REFERENCES `poultry_houses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sensors`
--

LOCK TABLES `sensors` WRITE;
/*!40000 ALTER TABLE `sensors` DISABLE KEYS */;
INSERT INTO `sensors` VALUES (1,17,NULL,'2026-07-21','SFN210726','AGB-AVL0FQW2ZEOP4INCQC17OWGQUR1U7ZAY',NULL,'Active','2026-07-21 00:18:18','2026-07-21 00:23:41');
/*!40000 ALTER TABLE `sensors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `service_requests`
--

DROP TABLE IF EXISTS `service_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `request_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_id` bigint unsigned NOT NULL,
  `requested_by` bigint unsigned NOT NULL,
  `assigned_to` bigint unsigned DEFAULT NULL,
  `service_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('Pending','Scheduled','Completed','Cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
  `priority` enum('Low','Medium','High','Critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Medium',
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `service_requests_request_number_unique` (`request_number`),
  KEY `service_requests_farm_id_foreign` (`farm_id`),
  KEY `service_requests_requested_by_foreign` (`requested_by`),
  KEY `service_requests_assigned_to_foreign` (`assigned_to`),
  CONSTRAINT `service_requests_assigned_to_foreign` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `service_requests_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `service_requests_requested_by_foreign` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `service_requests`
--

LOCK TABLES `service_requests` WRITE;
/*!40000 ALTER TABLE `service_requests` DISABLE KEYS */;
INSERT INTO `service_requests` VALUES (1,'SR-1011',1,3,2,'Vaccine Request','Newcastle disease vaccine needed.','Completed','High','2026-07-14 16:59:38','2026-07-20 15:20:13','2026-07-12 16:59:38','2026-07-20 15:20:13'),(2,'SR-1010',2,4,NULL,'Odor Control Request','High ammonia levels detected.','Pending','Critical',NULL,NULL,'2026-07-12 16:59:38','2026-07-12 16:59:38'),(3,'SR-1009',1,3,2,'Vaccine Request','Routine vaccination schedule.','Completed','Medium','2026-07-07 16:59:38','2026-07-09 16:59:38','2026-07-12 16:59:38','2026-07-12 16:59:38'),(4,'SR-1012',3,5,2,'Vaccine Request','Fowl pox vaccination needed for new batch.','Pending','Medium',NULL,NULL,'2026-07-12 16:59:38','2026-07-12 16:59:38'),(5,'SR-1008',1,3,2,'Vaccine Request','Booster shots for layer flock.','Completed','Low','2026-06-27 16:59:38','2026-06-28 16:59:38','2026-07-12 16:59:38','2026-07-12 16:59:38'),(6,'SR-1005',15,17,2,'Vaccine Request','vaccine test','Scheduled','Medium','2026-07-24 03:00:00',NULL,'2026-07-15 21:37:49','2026-07-15 21:39:10'),(7,'SR-1006',15,17,NULL,'Odor Control Request','Test - Odor control request','Pending','Medium',NULL,NULL,'2026-07-15 21:38:12','2026-07-15 21:38:12'),(8,'SR-1007',1,3,NULL,'Odor Control Request','test','Pending','Medium',NULL,NULL,'2026-07-19 21:22:04','2026-07-19 21:22:04'),(16,'SR-1013',1,3,2,'Vaccine Request','test','Scheduled','Medium','2026-07-23 01:00:00',NULL,'2026-07-20 14:53:18','2026-07-20 15:19:31'),(17,'SR-1014',1,3,NULL,'Blood Test Request','test 2','Pending','Medium',NULL,NULL,'2026-07-20 14:53:30','2026-07-20 14:53:30'),(18,'SR-1015',1,3,NULL,'Odor Control Request','tesst 3','Pending','Medium',NULL,NULL,'2026-07-20 14:53:42','2026-07-20 14:53:42'),(19,'SR-1016',1,3,1,'Fly Control Request','test 4','Scheduled','Medium','2026-07-24 01:00:00',NULL,'2026-07-20 14:53:54','2026-07-21 05:18:29');
/*!40000 ALTER TABLE `service_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sms_logs`
--

DROP TABLE IF EXISTS `sms_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sms_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `farm_id` bigint unsigned DEFAULT NULL,
  `phone_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('Account Creation','Farm Status') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Sent','Failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sms_logs_user_id_foreign` (`user_id`),
  KEY `sms_logs_farm_id_foreign` (`farm_id`),
  CONSTRAINT `sms_logs_farm_id_foreign` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sms_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sms_logs`
--

LOCK TABLES `sms_logs` WRITE;
/*!40000 ALTER TABLE `sms_logs` DISABLE KEYS */;
INSERT INTO `sms_logs` VALUES (1,4,2,'0917 222 3344','AgriBantay Update: Dela Cruz Layer Farm is now at Critical level as of Jul 13, 2026 12:48 AM. Recommended: check farm ventilation and equipment soon.','Farm Status','Sent','msg_9a4f0a9b-4b15-4f85-bcc0-4e885eeba0a6',NULL,'2026-07-12 16:49:03','2026-07-12 16:49:03'),(2,5,3,'0918 555 7890','AgriBantay Update: Bautista Poultry Farm is now at Moderate level as of Jul 13, 2026 12:49 AM. Recommended: monitor ventilation and litter conditions.','Farm Status','Sent','msg_3fc17851-0acc-4f3b-830e-3fd1f0fb81a4',NULL,'2026-07-12 16:49:04','2026-07-12 16:49:04'),(3,17,NULL,'09927724857','Welcome to AgriBantay, Joshua! Your account is ready. Temporary password: 0OMU1Gc4pT. You will be asked to set a new password on your first visit to the AgriBantay portal.','Account Creation','Sent','msg_577e7b40-11fa-44de-8920-7386a11e7b79',NULL,'2026-07-12 19:12:00','2026-07-12 19:12:00'),(4,19,NULL,'09923177049','Welcome to AgriBantay, Glysel Anne! Your account is ready. Temporary password: ALnu8yQabP. You will be asked to set a new password on your first visit to the AgriBantay portal.','Account Creation','Failed',NULL,'cURL error 28: Resolving timed out after 10003 milliseconds (see https://curl.se/libcurl/c/libcurl-errors.html) for https://unismsapi.com/api/sms','2026-07-15 23:44:15','2026-07-15 23:44:15'),(5,3,1,'0917 123 4567','AgriBantay Update: Santos Poultry Farm is now at Moderate level as of Jul 19, 2026 11:42 PM. Recommended: monitor ventilation and litter conditions.','Farm Status','Sent','msg_24ebcf84-d0f5-4916-a3af-4010ba55b16a',NULL,'2026-07-19 15:42:06','2026-07-19 15:42:06'),(6,4,2,'0917 222 3344','AgriBantay Update: Dela Cruz Layer Farm is now at Safe level as of Jul 19, 2026 11:42 PM. Farm conditions are back to normal levels.','Farm Status','Sent','msg_daa42f0e-9e1e-4953-8eec-4fafe939e001',NULL,'2026-07-19 15:42:06','2026-07-19 15:42:06'),(7,5,3,'0918 555 7890','AgriBantay Update: Bautista Poultry Farm is now at Safe level as of Jul 19, 2026 11:42 PM. Farm conditions are back to normal levels.','Farm Status','Sent','msg_841b4d46-9108-455f-81ba-94c40ff3fd14',NULL,'2026-07-19 15:42:07','2026-07-19 15:42:07'),(8,6,4,'0919 888 1212','AgriBantay Update: Reyes Layer Farm is now at Moderate level as of Jul 19, 2026 11:42 PM. Recommended: monitor ventilation and litter conditions.','Farm Status','Sent','msg_ba9e6ca0-2a6a-4ef1-bd47-5881bfbb4d9f',NULL,'2026-07-19 15:42:08','2026-07-19 15:42:08'),(9,22,NULL,'09923177047','Welcome to AgriBantay, Marcus! Your account is ready. Temporary password: A2SCSXFNka. You will be asked to set a new password on your first visit to the AgriBantay portal.','Account Creation','Sent','msg_ccd4ef3b-c6b1-4a5e-855d-059e21077333',NULL,'2026-07-19 19:01:46','2026-07-19 19:01:46'),(10,23,NULL,'09661472252','Welcome to AgriBantay, Joana Marie! Your account is ready. Temporary password: m47RwC5lsT. You will be asked to set a new password on your first visit to the AgriBantay portal.','Account Creation','Sent','msg_a752f6f4-ae9a-4522-8a28-2dc48185d8cc',NULL,'2026-07-20 23:25:59','2026-07-20 23:25:59'),(11,23,17,'09661472252','AgriBantay Update: Hernan\'s Farm is now at Critical level as of Jul 21, 2026 8:23 AM. Recommended: check farm ventilation and equipment soon.','Farm Status','Sent','msg_4af7ea17-7083-4b38-9c68-7cb409ccfb1b',NULL,'2026-07-21 00:23:41','2026-07-21 00:23:41');
/*!40000 ALTER TABLE `sms_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `first_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `username` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mobile_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('super_admin','admin','vet','farm_owner') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0',
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_mobile_number_unique` (`mobile_number`),
  UNIQUE KEY `users_email_unique` (`email`),
  UNIQUE KEY `users_username_unique` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'LGU','Administrator','admin@agribantay.gov.ph',NULL,'0917 000 0000','$2y$12$oYdGtq5oll7f6HgURc7Zw.bQeolRf4zcYj0yrE4zJqAqW0g6LDcVC','admin','active',0,NULL,'2026-07-12 16:48:25','2026-07-12 16:48:25'),(2,'Dr. Andrea','Reyes','andreareyes@agribantay.gov.ph',NULL,'0917 563 0121','$2y$12$3HPITMFchF9Q3UO3jdIdHODwY1rM7ldUMNHCfSxFL.KxlDnDaKPKa','vet','active',0,NULL,'2026-07-12 16:48:26','2026-07-12 16:48:26'),(3,'Ramon','Santos',NULL,NULL,'0917 123 4567','$2y$12$Zu2Nm7JH75qm6NWzqwsR.uU.5kg6A9NmUImb/4vIeOW3Nb1rdQRJ6','farm_owner','active',0,NULL,'2026-07-12 16:48:26','2026-07-12 16:48:26'),(4,'Maria','Dela Cruz',NULL,NULL,'0917 222 3344','$2y$12$g3REIilDEAvZCovgpi//2OthzKI3lBg7.tnuh5uIWYoD1RwF5k8lS','farm_owner','active',0,NULL,'2026-07-12 16:48:26','2026-07-12 16:48:26'),(5,'Jose','Bautista',NULL,NULL,'0918 555 7890','$2y$12$B3iOvNX/r8filTQ53JgDMerVw4Jf9ONNR9ecTKMBprTyHGt6/bkpK','farm_owner','active',0,NULL,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(6,'Liza','Reyes',NULL,NULL,'0919 888 1212','$2y$12$IOjSGcJYizzYCTfZyeqtn.SVQY/waoTBSqd1G8SHDa8P8Kd/jYN6a','farm_owner','active',0,NULL,'2026-07-12 16:48:27','2026-07-12 16:48:27'),(7,'Marcus Neo','Rangel',NULL,NULL,'0929 407 7940','$2y$12$02kZ8sF270mdZEZhOL23uuBk3G8zRltMRlu2.CjU8fatDEKENpRLG','farm_owner','active',0,NULL,'2026-07-12 19:04:41','2026-07-12 19:04:41'),(8,'Joshua Rhey','Magbanua',NULL,NULL,'0992 772 4857','$2y$12$QXkxQ.LxzKN3/b.gdMZAWuJebQQNLIhBL/Kj5NcUhLgnShL9Jt/AK','farm_owner','active',0,NULL,'2026-07-12 19:04:41','2026-07-12 19:04:41'),(9,'Elena','Villaruel',NULL,NULL,'0917 345 6789','$2y$12$KOnDH2e/KbpKGTdz36Rxmufl3HwACjJhH1siIrZ1zoKBPHyT0XwJW','farm_owner','active',0,NULL,'2026-07-12 19:04:41','2026-07-12 19:04:41'),(10,'Roberto','Manalo',NULL,NULL,'0918 234 5678','$2y$12$r33/6AOgM.S/7cuaT8rACO22NEA7eGUzN3jAE9lUZj4wBAd503.dy','farm_owner','active',0,NULL,'2026-07-12 19:04:42','2026-07-12 19:04:42'),(11,'Carmela','Torres',NULL,NULL,'0919 456 7890','$2y$12$XULv2AGhEVR42crwsOppUuLsIhk2VVO3x/1m2/9L650opGnNVWWKu','farm_owner','active',0,NULL,'2026-07-12 19:04:42','2026-07-12 19:04:42'),(12,'Danilo','Cruz',NULL,NULL,'0920 567 8901','$2y$12$awrInX8Z4sA1Xe0nDTiiPeMy7xnXvyY7riQUJ48FDClNiUt5Ma.Em','farm_owner','active',0,NULL,'2026-07-12 19:04:43','2026-07-12 19:04:43'),(13,'Michelle','Ramos',NULL,NULL,'0921 678 9012','$2y$12$4/Nc.o/LJDxPEV3Q7RDRGOLnvI5Aw.XlUEUgDPJovPqAT2nmwmIL.','farm_owner','active',0,NULL,'2026-07-12 19:04:43','2026-07-12 19:04:43'),(14,'Ferdinand','Aquino',NULL,NULL,'0922 789 0123','$2y$12$5EmC7gWmlHH9YRXDLqbCwOI3pv6QLLSJzkyrj3rKZpO.4F1xJMkjO','farm_owner','active',0,NULL,'2026-07-12 19:04:43','2026-07-12 19:04:43'),(15,'Isabel','Garcia',NULL,NULL,'0923 890 1234','$2y$12$4bQCfguTjU4HY6JSgtNjR..zkVcutuXTvAMSYCiK6eTRu8JKzLs1y','farm_owner','active',0,NULL,'2026-07-12 19:04:44','2026-07-12 19:04:44'),(16,'Nestor','Villanueva',NULL,NULL,'0924 901 2345','$2y$12$e4gVxDQH55Tj5tFnN8.t9Ol6chIPS56ReaeCI4I8Z8jSdFdh7oZS2','farm_owner','active',0,NULL,'2026-07-12 19:04:44','2026-07-12 19:04:44'),(17,'Joshua','Magbanua',NULL,NULL,'09927724857','$2y$12$ZKHPHlTN7amX8HMPazEa2uYd5ixctaGP.wNZYJsCG/UTX527vrm4m','farm_owner','active',0,NULL,'2026-07-12 19:11:56','2026-07-12 19:15:00'),(18,'Joana','Marie Briones','brionesjoana25@gmail.com',NULL,'0908142235','$2y$12$1.Yt6u/GacXWR5LiLaFksu9t0fNgAmbK7XVbhkcy3IIHPwqEDsF2K','vet','inactive',0,NULL,'2026-07-14 22:23:22','2026-07-15 21:37:18'),(19,'Glysel Anne','Sales',NULL,NULL,'09923177049','$2y$12$.qs.M24c/u8StkUruZglKOIowquHlOnhO2ZspvUdW0ULh7kFoDEWe','farm_owner','active',1,NULL,'2026-07-15 23:43:59','2026-07-15 23:43:59'),(20,'System','Super Admin','superadmin@agribantay.gov.ph',NULL,'0917 999 9999','$2y$12$Vki2WPNTsa6iFHouIBSQMeUY1YgtIYM5O9L2o85jlxTsxgGHbioBW','super_admin','active',0,NULL,'2026-07-19 01:23:52','2026-07-19 01:23:52'),(22,'Marcus','Rangel',NULL,NULL,'09923177047','$2y$12$ECJIVqKs2PaY5cgH9yWRXenUlSyR.M3x.GbKf/vG7kPDyw80da.4W','farm_owner','active',1,NULL,'2026-07-19 19:01:40','2026-07-19 19:01:40'),(23,'Joana Marie','Briones',NULL,NULL,'09661472252','$2y$12$EAb0fo3HAGJ9DagFOXC.WOg.5FitcC3u5fVFbOXuiC4EIQ9Zz3C1e','farm_owner','active',1,NULL,'2026-07-20 23:25:58','2026-07-20 23:25:58');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-21 22:44:50
