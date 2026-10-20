CREATE TABLE `plan_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_email` text,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_by` text,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_invites_token_hash_unique` ON `plan_invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `plan_members` (
	`owner_id` text NOT NULL,
	`member_id` text NOT NULL,
	`email` text,
	`owner_email` text,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `member_id`)
);
--> statement-breakpoint
CREATE TABLE `plan_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active_owner_id` text NOT NULL
);
