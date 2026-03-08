import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const fileVisibilityEnum = pgEnum("file_visibility", ["private", "org", "public"]);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id"),

  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),

  // S3 / object storage
  bucket: text("bucket").notNull(),
  key: text("key").notNull().unique(),
  url: text("url"),

  visibility: fileVisibilityEnum("visibility").notNull().default("private"),
  purpose: text("purpose"), // "agent_artifact" | "model_checkpoint" | "report" | "avatar"

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
