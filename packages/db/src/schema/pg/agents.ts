import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agentStatusEnum, agentTypeEnum } from "./enums.js";
import { users } from "./users.js";

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),

    name: text("name").notNull(),
    description: text("description"),
    type: agentTypeEnum("type").notNull(),
    status: agentStatusEnum("status").notNull().default("idle"),

    // Config is encrypted at rest — may contain connector credentials, API endpoints
    config: jsonb("config").notNull().default({}),
    configIv: text("config_iv"), // IV for config encryption

    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index("agents_user_id_idx").on(t.userId),
    orgIdIdx: index("agents_org_id_idx").on(t.orgId),
    statusIdx: index("agents_status_idx").on(t.status),
    typeIdx: index("agents_type_idx").on(t.type),
    deletedAtIdx: index("agents_deleted_at_idx").on(t.deletedAt),
  }),
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Status lifecycle: queued → executing → completed | failed | timed_out
    status: text("status").notNull().default("queued"),

    // Input from the caller — passed to the Python runtime as-is
    inputPayload: jsonb("input_payload").notNull().default({}),

    // Optional per-run timeout override (seconds). NULL = use daemon default.
    timeoutOverrideSecs: integer("timeout_override_secs"),

    // Output from the Python runtime
    outputPayload: jsonb("output_payload"),

    // Token accounting — populated by ANALYZE phase from runtime response
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),

    // Error details — separated so dashboards can group by code without parsing messages
    errorCode: text("error_code"),
    errorMessage: text("error_message"),

    // Sandbox metadata (macOS seatbelt or Linux seccomp)
    sandboxId: text("sandbox_id"),
    sandboxType: text("sandbox_type"), // "seccomp" | "seatbelt" | "wasi"

    // Large output stored in object storage — only keep the key here
    resultStorageKey: text("result_storage_key"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    agentIdIdx: index("agent_runs_agent_id_idx").on(t.agentId),
    userIdIdx: index("agent_runs_user_id_idx").on(t.userId),
    // Composite index for the daemon's SKIP LOCKED queue poll
    statusCreatedIdx: index("agent_runs_status_created_idx").on(t.status, t.createdAt),
  }),
);

// ─── Agent Skills ─────────────────────────────────────────────────────────────

export const agentSkills = pgTable(
  "agent_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(), // "http_fetch" | "web_search" | "code_exec"
    config: jsonb("config").notNull().default({}), // skill-specific config (e.g. max_results)
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentSkillUniq: index("agent_skills_agent_skill_uniq").on(t.agentId, t.skillName),
    agentIdIdx: index("agent_skills_agent_id_idx").on(t.agentId),
  }),
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentSkill = typeof agentSkills.$inferSelect;
