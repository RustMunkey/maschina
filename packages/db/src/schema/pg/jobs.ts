import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { jobStatusEnum } from "./enums.js";
import { users } from "./users.js";

export const jobs = pgTable("jobs", {
  id:     uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

  queue:  text("queue").notNull(),  // "agent" | "email" | "billing" | "analytics"
  type:   text("type").notNull(),   // "agent.execute" | "email.send" | "invoice.generate"

  // Payload encrypted if it may contain secrets (connector credentials, user data)
  payload:    jsonb("payload").notNull(),
  payloadIv:  text("payload_iv"),

  status:      jobStatusEnum("status").notNull().default("pending"),
  attempt:     integer("attempt").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  error:       text("error"),
  result:      jsonb("result"),

  scheduledAt:  timestamp("scheduled_at",   { withTimezone: true }).notNull().defaultNow(),
  startedAt:    timestamp("started_at",     { withTimezone: true }),
  completedAt:  timestamp("completed_at",   { withTimezone: true }),
  nextRetryAt:  timestamp("next_retry_at",  { withTimezone: true }),
  createdAt:    timestamp("created_at",     { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Primary queue worker query
  statusScheduledIdx: index("jobs_status_scheduled_idx").on(t.status, t.scheduledAt),
  queueStatusIdx:     index("jobs_queue_status_idx").on(t.queue, t.status),
  userIdIdx:          index("jobs_user_id_idx").on(t.userId),
  nextRetryIdx:       index("jobs_next_retry_idx").on(t.nextRetryAt),
}));

export type Job    = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
