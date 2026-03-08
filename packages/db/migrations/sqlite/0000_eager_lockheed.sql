CREATE TABLE `user_passwords` (
	`user_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_index` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`role` text DEFAULT 'member' NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`last_seen_at` integer,
	`license_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_index_unique` ON `users` (`email_index`);--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`token_iv` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_tokens_token_hash_unique` ON `verification_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tier` text NOT NULL,
	`stripe_price_id_monthly` text,
	`stripe_price_id_annual` text,
	`monthly_agent_executions` integer DEFAULT 50 NOT NULL,
	`monthly_api_calls` integer DEFAULT 500 NOT NULL,
	`monthly_model_inferences` integer DEFAULT 0 NOT NULL,
	`max_agents` integer DEFAULT 1 NOT NULL,
	`max_api_keys` integer DEFAULT 0 NOT NULL,
	`max_team_members` integer DEFAULT 1 NOT NULL,
	`max_connectors` integer DEFAULT 1 NOT NULL,
	`storage_gb` integer DEFAULT 1 NOT NULL,
	`features` text DEFAULT '{}' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_tier_unique` ON `plans` (`tier`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`stripe_customer_id` text NOT NULL,
	`stripe_subscription_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`interval` text DEFAULT 'monthly' NOT NULL,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`cancel_at_period_end` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`monthly_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`api_key_id` text,
	`type` text NOT NULL,
	`units` integer DEFAULT 1 NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`model` text,
	`agent_id` text,
	`payload_storage_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `usage_rollups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`total_units` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`user_id` text NOT NULL,
	`phase` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`result_storage_key` text,
	`result` text,
	`error` text,
	`sandbox_id` text,
	`sandbox_type` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`config_iv` text,
	`last_run_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `consent_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`version` text NOT NULL,
	`granted` integer NOT NULL,
	`ip_address` text,
	`ip_iv` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `data_export_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`storage_key` text,
	`expires_at` integer,
	`requested_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `data_retention_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`resource` text NOT NULL,
	`retain_days` integer NOT NULL,
	`description` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_retention_policies_resource_unique` ON `data_retention_policies` (`resource`);--> statement-breakpoint
CREATE TABLE `encryption_key_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`algorithm` text DEFAULT 'AES-256-GCM' NOT NULL,
	`description` text,
	`is_active` integer DEFAULT false NOT NULL,
	`activated_at` integer,
	`retired_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `encryption_key_versions_version_unique` ON `encryption_key_versions` (`version`);--> statement-breakpoint
CREATE TABLE `training_consent` (
	`user_id` text PRIMARY KEY NOT NULL,
	`opted_in` integer DEFAULT false NOT NULL,
	`opted_in_at` integer,
	`opted_out_at` integer,
	`data_from_date` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
