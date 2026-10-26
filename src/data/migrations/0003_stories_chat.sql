ALTER TABLE `chat` ADD `character` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat` ADD `situation` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat` ADD `topic` text;--> statement-breakpoint
ALTER TABLE `chat` ADD `targets` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat` ADD `max_turns` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `chat` ADD `result` text;--> statement-breakpoint
ALTER TABLE `chat` ADD `ended_at` integer;