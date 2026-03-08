import type { Config } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const isSQLite = url.startsWith("file:");

export default {
  schema: isSQLite ? "./src/schema/sqlite/index.ts" : "./src/schema/pg/index.ts",
  out: isSQLite ? "./migrations/sqlite" : "./migrations/pg",
  dialect: isSQLite ? "sqlite" : "postgresql",
  dbCredentials: { url },
} satisfies Config;
