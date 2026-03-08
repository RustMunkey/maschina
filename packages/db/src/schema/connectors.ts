import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const connectorStatusEnum = pgEnum("connector_status", [
  "active",
  "error",
  "disconnected",
  "pending",
]);

// Connector definitions (what integrations exist)
export const connectorDefinitions = pgTable("connector_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),   // "alpaca", "binance", "tradingview", "stripe"
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),   // "broker" | "data" | "payment" | "crm" | "custom"
  logoUrl: text("logo_url"),
  configSchema: jsonb("config_schema"),   // JSON Schema for required credentials
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// User-installed connector instances
export const connectors = pgTable("connectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id"),
  definitionId: uuid("definition_id").notNull().references(() => connectorDefinitions.id),

  name: text("name").notNull(),           // user-given label
  status: connectorStatusEnum("status").notNull().default("pending"),
  lastError: text("last_error"),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Encrypted credentials per connector (never stored plaintext)
export const connectorCredentials = pgTable("connector_credentials", {
  connectorId: uuid("connector_id").primaryKey().references(() => connectors.id, { onDelete: "cascade" }),
  encryptedData: text("encrypted_data").notNull(),  // AES-256-GCM encrypted JSON
  iv: text("iv").notNull(),                          // initialization vector
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConnectorDefinition = typeof connectorDefinitions.$inferSelect;
export type Connector = typeof connectors.$inferSelect;
export type NewConnector = typeof connectors.$inferInsert;
