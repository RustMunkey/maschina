CREATE TYPE "public"."node_status" AS ENUM('pending', 'active', 'suspended', 'offline', 'banned');--> statement-breakpoint
CREATE TYPE "public"."node_tier" AS ENUM('micro', 'edge', 'standard', 'verified', 'datacenter');--> statement-breakpoint
CREATE TYPE "public"."stake_event_type" AS ENUM('deposit', 'withdraw', 'slash');--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" "node_status" NOT NULL DEFAULT 'pending',
	"tier" "node_tier" NOT NULL DEFAULT 'standard',
	"version" text,
	"region" text,
	"internal_url" text,
	"staked_usdc" numeric(18, 6) NOT NULL DEFAULT '0',
	"reputation_score" numeric(5, 2) NOT NULL DEFAULT '50',
	"total_tasks_completed" integer NOT NULL DEFAULT 0,
	"total_tasks_failed" integer NOT NULL DEFAULT 0,
	"total_tasks_timed_out" integer NOT NULL DEFAULT 0,
	"last_heartbeat_at" timestamp with time zone,
	"public_key" text,
	"tee_attested" boolean NOT NULL DEFAULT false,
	"tee_attested_at" timestamp with time zone,
	"tee_provider" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"suspended_at" timestamp with time zone,
	"banned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "node_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL UNIQUE,
	"cpu_cores" integer,
	"cpu_model" text,
	"architecture" text,
	"ram_gb" numeric(8, 2),
	"storage_gb" numeric(10, 2),
	"has_gpu" boolean NOT NULL DEFAULT false,
	"gpu_model" text,
	"gpu_vram_gb" numeric(8, 2),
	"gpu_count" integer,
	"os_type" text,
	"os_version" text,
	"max_concurrent_tasks" integer NOT NULL DEFAULT 1,
	"network_bandwidth_mbps" integer,
	"supported_models" jsonb NOT NULL DEFAULT '[]',
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "node_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"cpu_usage_pct" numeric(5, 2),
	"ram_usage_pct" numeric(5, 2),
	"active_task_count" integer NOT NULL DEFAULT 0,
	"health_status" text NOT NULL DEFAULT 'online',
	"recorded_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "node_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL DEFAULT 0,
	"output_tokens" integer NOT NULL DEFAULT 0,
	"billing_multiplier" numeric(5, 2) NOT NULL DEFAULT '1',
	"total_cents" integer NOT NULL,
	"node_cents" integer NOT NULL,
	"developer_cents" integer NOT NULL,
	"treasury_cents" integer NOT NULL,
	"validator_cents" integer NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "node_stake_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"event_type" "stake_event_type" NOT NULL,
	"amount_usdc" numeric(18, 6) NOT NULL,
	"balance_after_usdc" numeric(18, 6) NOT NULL,
	"reason" text,
	"triggered_by" uuid,
	"slash_pct" numeric(5, 2),
	"tx_signature" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_capabilities" ADD CONSTRAINT "node_capabilities_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_heartbeats" ADD CONSTRAINT "node_heartbeats_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_earnings" ADD CONSTRAINT "node_earnings_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_stake_events" ADD CONSTRAINT "node_stake_events_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_stake_events" ADD CONSTRAINT "node_stake_events_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nodes_user_id_idx" ON "nodes" ("user_id");--> statement-breakpoint
CREATE INDEX "nodes_status_idx" ON "nodes" ("status");--> statement-breakpoint
CREATE INDEX "nodes_tier_idx" ON "nodes" ("tier");--> statement-breakpoint
CREATE INDEX "nodes_region_idx" ON "nodes" ("region");--> statement-breakpoint
CREATE INDEX "nodes_routing_idx" ON "nodes" ("status", "tier", "region");--> statement-breakpoint
CREATE UNIQUE INDEX "node_capabilities_node_id_idx" ON "node_capabilities" ("node_id");--> statement-breakpoint
CREATE INDEX "node_capabilities_has_gpu_idx" ON "node_capabilities" ("has_gpu");--> statement-breakpoint
CREATE INDEX "node_heartbeats_node_id_idx" ON "node_heartbeats" ("node_id");--> statement-breakpoint
CREATE INDEX "node_heartbeats_node_recorded_idx" ON "node_heartbeats" ("node_id", "recorded_at");--> statement-breakpoint
CREATE INDEX "node_earnings_node_id_idx" ON "node_earnings" ("node_id");--> statement-breakpoint
CREATE INDEX "node_earnings_run_id_idx" ON "node_earnings" ("run_id");--> statement-breakpoint
CREATE INDEX "node_earnings_status_idx" ON "node_earnings" ("status");--> statement-breakpoint
CREATE INDEX "node_earnings_node_status_idx" ON "node_earnings" ("node_id", "status");--> statement-breakpoint
CREATE INDEX "node_stake_events_node_id_idx" ON "node_stake_events" ("node_id");--> statement-breakpoint
CREATE INDEX "node_stake_events_event_type_idx" ON "node_stake_events" ("event_type");--> statement-breakpoint
CREATE INDEX "node_stake_events_node_created_idx" ON "node_stake_events" ("node_id", "created_at");
