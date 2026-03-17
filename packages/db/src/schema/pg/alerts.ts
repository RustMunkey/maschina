import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { alertSeverityEnum, notificationTypeEnum } from "./enums.js";
import { users } from "./users.js";

// Alerts are persistent, action-oriented messages surfaced prominently (banner,
// alert centre). Unlike in-app notifications (transient bell feed), alerts stay
// visible until the user explicitly acknowledges them.
//
// The same event can trigger both a notification (bell) AND an alert (banner)
// — e.g. quota_exceeded pops a bell entry AND a persistent warning banner.
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    severity: alertSeverityEnum("severity").notNull().default("info"),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    data: jsonb("data"), // extra context for rendering
    actionUrl: text("action_url"), // deep link or dashboard URL

    acknowledged: boolean("acknowledged").notNull().default(false),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = never expires
  },
  (t) => ({
    userActiveIdx: index("alerts_user_active_idx").on(t.userId, t.acknowledged),
    createdAtIdx: index("alerts_created_at_idx").on(t.createdAt),
  }),
);

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
