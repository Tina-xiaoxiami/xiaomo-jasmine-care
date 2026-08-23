CREATE TABLE `care_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`record_date` text NOT NULL,
	`completed` text DEFAULT '[]' NOT NULL,
	`soil` text DEFAULT 'unknown' NOT NULL,
	`leaves` text DEFAULT 'healthy' NOT NULL,
	`bloom` text DEFAULT 'unknown' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`photo_key` text,
	`fertilized` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `care_records_device_date_idx` ON `care_records` (`device_id`,`record_date`);