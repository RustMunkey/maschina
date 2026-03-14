import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workflowRunStatusEnum, workflowTypeEnum } from "./enums.js";
import { users } from "./users.js";

// ─── Workflow definitions ─────────────────────────────────────────────────────
// A workflow is a reusable multi-agent pipeline. Steps are stored as JSONB.
// Each step: { id, name, type, agentId?, prompt?, onTrue?, onFalse?, parallelSteps? }

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: workflowTypeEnum("type").notNull().default("sequential"),
    // Ordered array of step definitions
    steps: jsonb("steps").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("workflows_user_idx").on(t.userId),
  }),
);

// ─── Workflow runs ────────────────────────────────────────────────────────────
// Each triggered execution of a workflow definition.

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: workflowRunStatusEnum("status").notNull().default("pending"),
    // Initial input passed to the first step
    input: jsonb("input").notNull().default({}),
    // Final output (last step output for sequential, all outputs for parallel)
    output: jsonb("output"),
    error: text("error"),
    // Temporal identifiers for correlation + cancellation
    temporalWorkflowId: text("temporal_workflow_id"),
    temporalRunId: text("temporal_run_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workflowIdx: index("workflow_runs_workflow_idx").on(t.workflowId),
    userIdx: index("workflow_runs_user_idx").on(t.userId),
    statusIdx: index("workflow_runs_status_idx").on(t.status),
  }),
);

export type Workflow = typeof workflows.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
