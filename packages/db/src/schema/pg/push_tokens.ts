import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pushPlatformEnum } from "./enums.js";
import { users } from "./users.js";

// Stores device/browser push subscriptions per user.
// subscription shape varies by platform:
//   apns    → { token: string }
//   fcm     → { token: string }
//   webpush → { endpoint: string, p256dh: string, auth: string }
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    platform: pushPlatformEnum("platform").notNull(),
    subscription: jsonb("subscription").notNull(),
    deviceName: text("device_name"), // e.g. "iPhone 15", "Chrome on Linux"

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("push_tokens_user_idx").on(t.userId),
    userPlatformIdx: index("push_tokens_user_platform_idx").on(t.userId, t.platform),
  }),
);

export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
