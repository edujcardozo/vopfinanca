CREATE TABLE `sync_chunks` (
	`user_id` text NOT NULL,
	`version_id` text NOT NULL,
	`part` integer NOT NULL,
	`content` text NOT NULL,
	PRIMARY KEY(`user_id`, `version_id`, `part`)
);
--> statement-breakpoint
CREATE TABLE `sync_plans` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`version_id` text,
	`mutation_id` text,
	`document_hash` text,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_versions` (
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`version_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`document_hash` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `revision`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_versions_mutation` ON `sync_versions` (`user_id`,`mutation_id`);