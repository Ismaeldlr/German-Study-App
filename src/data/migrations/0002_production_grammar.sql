CREATE TABLE `pending_grade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise_id` integer,
	`exercise` text NOT NULL,
	`answer` text NOT NULL,
	`response_ms` integer,
	`answered_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`result` text,
	`graded_at` integer,
	`seen_at` integer,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pending_grade_status_idx` ON `pending_grade` (`status`);--> statement-breakpoint
ALTER TABLE `card` ADD `leech_at` integer;--> statement-breakpoint
ALTER TABLE `grammar_note` ADD `categories` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `item` ADD `memory_hook` text;--> statement-breakpoint
ALTER TABLE `mistake` ADD `confused_item_id` integer REFERENCES item(id) ON DELETE set null;