CREATE TABLE `user_profiles` (
	`user_id` int NOT NULL,
	`monthly_income_kd` decimal(12,3),
	`payday_day` int,
	`country` varchar(64),
	`email_notifications_enabled` boolean NOT NULL DEFAULT true,
	`has_debt_choice` boolean,
	`setup_guide_seen` boolean NOT NULL DEFAULT false,
	`setup_guide_dismissed` boolean NOT NULL DEFAULT false,
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Kuwait',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_profiles_user_id` PRIMARY KEY(`user_id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`manus_user_id` varchar(255) NOT NULL,
	`display_name` varchar(128),
	`first_name` varchar(64),
	`last_name` varchar(64),
	`totp_secret` text,
	`totp_enabled` boolean NOT NULL DEFAULT false,
	`totp_backup_codes_json` text,
	`session_version` int NOT NULL DEFAULT 1,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_manus_user_id_unique` UNIQUE(`manus_user_id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`is_income` boolean DEFAULT false,
	`is_system` boolean NOT NULL DEFAULT false,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_category_user_name` UNIQUE(`user_id`,`name`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(128) NOT NULL,
	CONSTRAINT `merchants_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_merchant_user_name` UNIQUE(`user_id`,`name`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`date` date NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'manual',
	`merchant_id` int,
	`category_id` int,
	`name` varchar(255) NOT NULL,
	`memo` varchar(255),
	`name_key` varchar(255) NOT NULL,
	`amount_kd` decimal(10,3) NOT NULL,
	`created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
	`import_batch_id` char(36),
	`import_row_hash` varchar(64),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `ix_transactions_import_row_hash` UNIQUE(`import_row_hash`),
	CONSTRAINT `chk_transactions_amount_positive` CHECK(`transactions`.`amount_kd` > 0)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`category_id` int NOT NULL,
	`amount_kd` decimal(10,3) NOT NULL,
	`updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `budgets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_budget_user_month_category` UNIQUE(`user_id`,`month`,`category_id`),
	CONSTRAINT `chk_budgets_amount_positive` CHECK(`budgets`.`amount_kd` > 0)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `dashboard_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`months_count` int NOT NULL DEFAULT 24,
	`window_end_month` varchar(7) NOT NULL,
	`months_json` text NOT NULL DEFAULT ('[]'),
	`monthly_json` text NOT NULL DEFAULT ('[]'),
	`expense_by_category_json` text NOT NULL DEFAULT ('{}'),
	`computed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `dashboard_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_dashboard_snapshot_user_window` UNIQUE(`user_id`,`months_count`,`window_end_month`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `debt_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`debt_type` varchar(32) NOT NULL DEFAULT 'other',
	`balance_kd` decimal(12,3) NOT NULL DEFAULT '0',
	`apr_pct` decimal(6,3),
	`minimum_payment_kd` decimal(10,3) NOT NULL DEFAULT '0',
	`due_day` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`notes` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `debt_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_debt_accounts_user_name` UNIQUE(`user_id`,`name`),
	CONSTRAINT `chk_debt_balance_non_negative` CHECK(`debt_accounts`.`balance_kd` >= 0),
	CONSTRAINT `chk_debt_min_payment_non_negative` CHECK(`debt_accounts`.`minimum_payment_kd` >= 0)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`goal_type` varchar(32) NOT NULL DEFAULT 'custom',
	`target_kd` decimal(12,3) NOT NULL,
	`current_kd` decimal(12,3) NOT NULL DEFAULT '0',
	`target_date` date,
	`linked_category_id` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`notes` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `savings_goals_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_savings_target_positive` CHECK(`savings_goals`.`target_kd` > 0),
	CONSTRAINT `chk_savings_current_non_negative` CHECK(`savings_goals`.`current_kd` >= 0)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `memorized_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`canonical` varchar(255) NOT NULL,
	`norm` varchar(255) NOT NULL,
	`category_id` int,
	`merchant_id` int,
	`count` int NOT NULL DEFAULT 1,
	`last_seen` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`is_pinned` boolean NOT NULL DEFAULT false,
	`pinned_at` datetime(3),
	CONSTRAINT `memorized_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_memorized_user_norm` UNIQUE(`user_id`,`norm`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `template_suggestion_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`signature_key` varchar(64) NOT NULL,
	`accepted_count` int NOT NULL DEFAULT 0,
	`rejected_count` int NOT NULL DEFAULT 0,
	`last_accepted_at` datetime(3),
	`last_rejected_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `template_suggestion_feedback_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_template_feedback_user_signature` UNIQUE(`user_id`,`signature_key`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `account_action_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`purpose` varchar(32) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`payload_json` text,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `account_action_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_action_tokens_token_hash_unique` UNIQUE(`token_hash`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`event_type` varchar(64) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` varchar(255),
	`details_json` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `security_events_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `product_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`event_name` varchar(64) NOT NULL,
	`properties_json` text,
	`event_ts` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `product_events_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `worker_task_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_name` varchar(128) NOT NULL,
	`last_started_at` datetime(3),
	`last_finished_at` datetime(3),
	`last_success_at` datetime(3),
	`last_failure_at` datetime(3),
	`last_status` varchar(32) NOT NULL DEFAULT 'never',
	`last_error` varchar(255),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `worker_task_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `worker_task_runs_task_name_unique` UNIQUE(`task_name`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `bank_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`provider` varchar(64) NOT NULL,
	`external_institution_id` varchar(255),
	`account_number_masked` varchar(20),
	`institution_name` varchar(255) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`access_token` text,
	`refresh_token` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`revoked_at` datetime(3),
	`last_synced_at` datetime(3),
	CONSTRAINT `bank_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_bank_connections_user_provider_institution` UNIQUE(`user_id`,`provider`,`institution_name`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `bank_consents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connection_id` int NOT NULL,
	`user_id` int NOT NULL,
	`scopes` text NOT NULL DEFAULT ('["transactions:read"]'),
	`purpose_of_use` varchar(512) NOT NULL DEFAULT 'Personal financial analytics',
	`consent_reference` varchar(128),
	`data_recipient_name` varchar(255) NOT NULL DEFAULT 'Personal Statera',
	`scope_description` text NOT NULL DEFAULT ('Read-only access to transaction history for analytics'),
	`ip_address_granted` varchar(64),
	`user_agent_granted` varchar(255),
	`granted_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3),
	`revoked_at` datetime(3),
	`status` varchar(32) NOT NULL DEFAULT 'active',
	CONSTRAINT `bank_consents_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `bank_sync_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connection_id` int NOT NULL,
	`user_id` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'staged',
	`provider_cursor` varchar(255),
	`staged_count` int NOT NULL DEFAULT 0,
	`committed_count` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`committed_at` datetime(3),
	`abandoned_at` datetime(3),
	CONSTRAINT `bank_sync_runs_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `raw_bank_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connection_id` int NOT NULL,
	`sync_run_id` int NOT NULL,
	`user_id` int NOT NULL,
	`provider_tx_id` varchar(255) NOT NULL,
	`date` date NOT NULL,
	`description` varchar(128) NOT NULL,
	`amount_kd` decimal(10,3) NOT NULL,
	`raw_payload_hash` varchar(64),
	`category_hint` varchar(64),
	`merchant_hint` varchar(64),
	`status` varchar(32) NOT NULL DEFAULT 'staged',
	`transaction_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `raw_bank_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_raw_bank_txn_connection_provider_id` UNIQUE(`connection_id`,`provider_tx_id`),
	CONSTRAINT `chk_raw_bank_txns_amount_positive` CHECK(`raw_bank_transactions`.`amount_kd` > 0)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
CREATE TABLE `data_access_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`connection_id` int,
	`consent_id` int,
	`action` varchar(64) NOT NULL,
	`records_accessed` int NOT NULL DEFAULT 0,
	`date_range_start` date,
	`date_range_end` date,
	`ip_address` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `data_access_logs_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `merchants` ADD CONSTRAINT `merchants_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dashboard_snapshots` ADD CONSTRAINT `dashboard_snapshots_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debt_accounts` ADD CONSTRAINT `debt_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savings_goals` ADD CONSTRAINT `savings_goals_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `savings_goals` ADD CONSTRAINT `savings_goals_linked_category_id_categories_id_fk` FOREIGN KEY (`linked_category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memorized_transactions` ADD CONSTRAINT `memorized_transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memorized_transactions` ADD CONSTRAINT `memorized_transactions_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memorized_transactions` ADD CONSTRAINT `memorized_transactions_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_suggestion_feedback` ADD CONSTRAINT `template_suggestion_feedback_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account_action_tokens` ADD CONSTRAINT `account_action_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `security_events` ADD CONSTRAINT `security_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_events` ADD CONSTRAINT `product_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_connections` ADD CONSTRAINT `bank_connections_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_consents` ADD CONSTRAINT `bank_consents_connection_id_bank_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `bank_connections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_consents` ADD CONSTRAINT `bank_consents_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_sync_runs` ADD CONSTRAINT `bank_sync_runs_connection_id_bank_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `bank_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_sync_runs` ADD CONSTRAINT `bank_sync_runs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_bank_transactions` ADD CONSTRAINT `raw_bank_transactions_connection_id_bank_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `bank_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_bank_transactions` ADD CONSTRAINT `raw_bank_transactions_sync_run_id_bank_sync_runs_id_fk` FOREIGN KEY (`sync_run_id`) REFERENCES `bank_sync_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_bank_transactions` ADD CONSTRAINT `raw_bank_transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_bank_transactions` ADD CONSTRAINT `raw_bank_transactions_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_access_logs` ADD CONSTRAINT `data_access_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_access_logs` ADD CONSTRAINT `data_access_logs_connection_id_bank_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `bank_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_access_logs` ADD CONSTRAINT `data_access_logs_consent_id_bank_consents_id_fk` FOREIGN KEY (`consent_id`) REFERENCES `bank_consents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `ix_categories_user_id` ON `categories` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_categories_name` ON `categories` (`name`);--> statement-breakpoint
CREATE INDEX `ix_merchants_user_id` ON `merchants` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_merchants_name` ON `merchants` (`name`);--> statement-breakpoint
CREATE INDEX `ix_transactions_user_id` ON `transactions` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_transactions_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `ix_transactions_source` ON `transactions` (`source`);--> statement-breakpoint
CREATE INDEX `ix_transactions_merchant_id` ON `transactions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `ix_transactions_category_id` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `ix_transactions_name_key` ON `transactions` (`name_key`);--> statement-breakpoint
CREATE INDEX `ix_transactions_import_batch_id` ON `transactions` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `ix_transactions_user_date_id` ON `transactions` (`user_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `ix_transactions_user_category_date` ON `transactions` (`user_id`,`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `ix_transactions_user_source_date` ON `transactions` (`user_id`,`source`,`date`);--> statement-breakpoint
CREATE INDEX `ix_budgets_user_id` ON `budgets` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_budgets_month` ON `budgets` (`month`);--> statement-breakpoint
CREATE INDEX `ix_budgets_category_id` ON `budgets` (`category_id`);--> statement-breakpoint
CREATE INDEX `ix_budgets_user_month` ON `budgets` (`user_id`,`month`);--> statement-breakpoint
CREATE INDEX `ix_dashboard_snapshots_user_id` ON `dashboard_snapshots` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_dashboard_snapshots_window_end_month` ON `dashboard_snapshots` (`window_end_month`);--> statement-breakpoint
CREATE INDEX `ix_dashboard_snapshots_computed_at` ON `dashboard_snapshots` (`computed_at`);--> statement-breakpoint
CREATE INDEX `ix_dashboard_snapshots_user_computed` ON `dashboard_snapshots` (`user_id`,`computed_at`);--> statement-breakpoint
CREATE INDEX `ix_debt_accounts_user_id` ON `debt_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_debt_accounts_user_active` ON `debt_accounts` (`user_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `ix_savings_goals_user_id` ON `savings_goals` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_savings_goals_linked_category_id` ON `savings_goals` (`linked_category_id`);--> statement-breakpoint
CREATE INDEX `ix_savings_goals_user_active` ON `savings_goals` (`user_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `ix_memorized_transactions_user_id` ON `memorized_transactions` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_memorized_transactions_norm` ON `memorized_transactions` (`norm`);--> statement-breakpoint
CREATE INDEX `ix_memorized_transactions_category_id` ON `memorized_transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `ix_memorized_transactions_merchant_id` ON `memorized_transactions` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `ix_memorized_transactions_last_seen` ON `memorized_transactions` (`last_seen`);--> statement-breakpoint
CREATE INDEX `ix_template_feedback_user_id` ON `template_suggestion_feedback` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_template_feedback_user_updated` ON `template_suggestion_feedback` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `ix_account_action_tokens_user_id` ON `account_action_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_account_action_tokens_purpose` ON `account_action_tokens` (`purpose`);--> statement-breakpoint
CREATE INDEX `ix_account_action_tokens_expires_at` ON `account_action_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_account_action_tokens_used_at` ON `account_action_tokens` (`used_at`);--> statement-breakpoint
CREATE INDEX `ix_security_events_user_id` ON `security_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_security_events_event_type` ON `security_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `ix_security_events_created_at` ON `security_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_product_events_user_id` ON `product_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_product_events_event_name` ON `product_events` (`event_name`);--> statement-breakpoint
CREATE INDEX `ix_product_events_event_ts` ON `product_events` (`event_ts`);--> statement-breakpoint
CREATE INDEX `ix_product_events_user_event` ON `product_events` (`user_id`,`event_name`);--> statement-breakpoint
CREATE INDEX `ix_product_events_event_ts_name` ON `product_events` (`event_name`,`event_ts`);--> statement-breakpoint
CREATE INDEX `ix_worker_task_runs_task_name` ON `worker_task_runs` (`task_name`);--> statement-breakpoint
CREATE INDEX `ix_worker_task_runs_last_finished_at` ON `worker_task_runs` (`last_finished_at`);--> statement-breakpoint
CREATE INDEX `ix_bank_connections_user_id` ON `bank_connections` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_bank_connections_user_status` ON `bank_connections` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_bank_consents_connection_id` ON `bank_consents` (`connection_id`);--> statement-breakpoint
CREATE INDEX `ix_bank_consents_user_id` ON `bank_consents` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_bank_sync_runs_connection_id` ON `bank_sync_runs` (`connection_id`);--> statement-breakpoint
CREATE INDEX `ix_bank_sync_runs_user_id` ON `bank_sync_runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_bank_sync_runs_user_status` ON `bank_sync_runs` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_bank_sync_runs_created_at` ON `bank_sync_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_raw_bank_txns_connection_id` ON `raw_bank_transactions` (`connection_id`);--> statement-breakpoint
CREATE INDEX `ix_raw_bank_txns_sync_run_id` ON `raw_bank_transactions` (`sync_run_id`);--> statement-breakpoint
CREATE INDEX `ix_raw_bank_txns_user_id` ON `raw_bank_transactions` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_raw_bank_txns_created_at` ON `raw_bank_transactions` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_data_access_logs_user_id` ON `data_access_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_data_access_logs_connection_id` ON `data_access_logs` (`connection_id`);--> statement-breakpoint
CREATE INDEX `ix_data_access_logs_consent_id` ON `data_access_logs` (`consent_id`);--> statement-breakpoint
CREATE INDEX `ix_data_access_logs_action` ON `data_access_logs` (`action`);--> statement-breakpoint
CREATE INDEX `ix_data_access_logs_created_at` ON `data_access_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_data_access_logs_user_connection_created` ON `data_access_logs` (`user_id`,`connection_id`,`created_at`);