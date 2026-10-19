CREATE TABLE `card` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`type` text NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`due` integer NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	`suspended` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_item_type_unique` ON `card` (`item_id`,`type`);--> statement-breakpoint
CREATE INDEX `card_due_idx` ON `card` (`due`);--> statement-breakpoint
CREATE INDEX `card_state_idx` ON `card` (`state`);--> statement-breakpoint
CREATE TABLE `chapter` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book` text DEFAULT 'Momente A2' NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`themes` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_book_number_unique` ON `chapter` (`book`,`number`);--> statement-breakpoint
CREATE TABLE `chat` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scenario` text NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`target_item_ids` text DEFAULT '[]' NOT NULL,
	`summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode` text NOT NULL,
	`target_item_ids` text NOT NULL,
	`topic` text,
	`payload` text NOT NULL,
	`sentence_hash` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	`discarded` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exercise_mode_used_idx` ON `exercise` (`mode`,`used_at`);--> statement-breakpoint
CREATE TABLE `grammar_note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`rule_summary` text NOT NULL,
	`examples` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grammar_note_item_id_unique` ON `grammar_note` (`item_id`);--> statement-breakpoint
CREATE TABLE `item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`lemma` text NOT NULL,
	`article` text,
	`plural` text,
	`verb_present3` text,
	`verb_preterite` text,
	`verb_participle` text,
	`verb_auxiliary` text,
	`separable` integer DEFAULT false NOT NULL,
	`reflexive` integer DEFAULT false NOT NULL,
	`governed_case` text,
	`meanings` text NOT NULL,
	`example_de` text,
	`example_en` text,
	`chapter_id` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapter`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `item_lemma_idx` ON `item` (`lemma`);--> statement-breakpoint
CREATE INDEX `item_chapter_idx` ON `item` (`chapter_id`);--> statement-breakpoint
CREATE INDEX `item_kind_idx` ON `item` (`kind`);--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `llm_usage_day_provider_model_unique` ON `llm_usage` (`day`,`provider`,`model`);--> statement-breakpoint
CREATE TABLE `mistake` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer,
	`item_id` integer,
	`category` text NOT NULL,
	`your_text` text NOT NULL,
	`correction` text NOT NULL,
	`explanation` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mistake_item_idx` ON `mistake` (`item_id`);--> statement-breakpoint
CREATE INDEX `mistake_category_idx` ON `mistake` (`category`);--> statement-breakpoint
CREATE TABLE `review` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	`rating` integer NOT NULL,
	`mode` text NOT NULL,
	`response_ms` integer,
	`answer` text,
	`correct` integer NOT NULL,
	`state_before` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_card_idx` ON `review` (`card_id`);--> statement-breakpoint
CREATE INDEX `review_reviewed_at_idx` ON `review` (`reviewed_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`cards_done` integer DEFAULT 0 NOT NULL,
	`new_items` integer DEFAULT 0 NOT NULL,
	`accuracy` real
);
--> statement-breakpoint
CREATE TABLE `suggestion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lemma` text NOT NULL,
	`reason` text NOT NULL,
	`chapter_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapter`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_lemma_unique` ON `suggestion` (`lemma`);