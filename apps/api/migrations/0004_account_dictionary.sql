CREATE TABLE `account_dictionary` (
	`user_id` text PRIMARY KEY NOT NULL,
	`terms` text DEFAULT '[]' NOT NULL,
	`imports` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
