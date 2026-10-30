ALTER TABLE `item` ADD `curriculum_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `item_curriculum_unique` ON `item` (`curriculum_id`);