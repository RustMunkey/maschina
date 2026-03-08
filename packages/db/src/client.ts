import { createRequire } from "node:module";
import * as pgSchema from "./schema/pg/index.js";
import * as sqliteSchema from "./schema/sqlite/index.js";

// ESM-safe require for CJS-only packages.
// Both the drizzle adapter and the underlying driver are loaded lazily
// so the sqlite path never runs (and never fails) in production.
const require = createRequire(import.meta.url);

function createClient() {
  const url = process.env["DATABASE_URL"] ?? "file:./dev.db";

  if (url.startsWith("file:")) {
    const { drizzle } = require("drizzle-orm/better-sqlite3");
    const Database = require("better-sqlite3");
    const sqlite = new Database(url.replace("file:", ""));
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    return drizzle(sqlite, { schema: sqliteSchema });
  }

  const { drizzle } = require("drizzle-orm/postgres-js");
  const postgres = require("postgres");
  const pg = postgres(url, {
    ssl: url.includes("neon.tech") ? "require" : false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(pg, { schema: pgSchema });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = createClient();
export type Db = ReturnType<typeof createClient>;

export function isSQLite(): boolean {
  const url = process.env["DATABASE_URL"] ?? "file:./dev.db";
  return url.startsWith("file:");
}
