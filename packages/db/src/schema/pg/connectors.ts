import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { connectorStatusEnum } from "./enums.js";
import { users } from "./users.js";

export const connectorDefinitions = pgTable("connector_definitions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  slug:         text("slug").notNull().unique(),
  name:         text("name").notNull(),
  description:  text("description"),
  category:     text("category").notNull(), // "broker" | "data" | "payment" | "crm" | "custom"
  logoUrl:      text("logo_url"),
  configSchema: jsonb("config_schema"),     // JSON Schema for required credentials
  isActive:     boolean("is_active").notNull().default(true),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx:    index("connector_defs_slug_idx").on(t.slug),
  activeIdx:  index("connector_defs_active_idx").on(t.isActive),
}));

export const connectors = pgTable("connectors", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId:        uuid("org_id"),
  definitionId: uuid("definition_id").notNull().references(() => connectorDefinitions.id),

  name:            text("name").notNull(),
  status:          connectorStatusEnum("status").notNull().default("pending"),
  lastError:       text("last_error"),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx:  index("connectors_user_id_idx").on(t.userId),
  statusIdx:  index("connectors_status_idx").on(t.status),
}));

// AES-256-GCM encrypted credentials — never stored plaintext
export const connectorCredentials = pgTable("connector_credentials", {
  connectorId:    uuid("connector_id").primaryKey().references(() => connectors.id, { onDelete: "cascade" }),
  encryptedData:  text("encrypted_data").notNull(),
  iv:             text("iv").notNull(),
  keyVersion:     text("key_version").notNull().default("1"), // for key rotation
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Connector           = typeof connectors.$inferSelect;
export type ConnectorDefinition = typeof connectorDefinitions.$inferSelect;
