CREATE TABLE `speech_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`input_tokens` integer,
	`cached_tokens` integer,
	`output_tokens` integer,
	`cost_usd` real,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `speech_usage_user_created_idx` ON `speech_usage` (`user_id`,`created_at`);