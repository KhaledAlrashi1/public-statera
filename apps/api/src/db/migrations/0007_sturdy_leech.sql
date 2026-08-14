CREATE TABLE `magic_link_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`user_id` int,
	`expires_at` datetime(3) NOT NULL,
	`consumed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `magic_link_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `magic_link_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `magic_link_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_magic_link_tokens_email` ON `magic_link_tokens` (`email`);--> statement-breakpoint
CREATE INDEX `ix_magic_link_tokens_user_id` ON `magic_link_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_magic_link_tokens_expires_at` ON `magic_link_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_magic_link_tokens_consumed_at` ON `magic_link_tokens` (`consumed_at`);