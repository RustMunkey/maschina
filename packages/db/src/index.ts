export { db, isSQLite } from "./client.js";
export type { Db } from "./client.js";

// Export canonical (pg) schema types — used for type inference across the app.
// At runtime the correct dialect schema is loaded inside client.ts.
export * from "./schema/pg/index.js";

// Named re-export for cases where you need explicit dialect schemas
export * as pgSchema from "./schema/pg/index.js";
export * as sqliteSchema from "./schema/sqlite/index.js";

// Re-export drizzle-orm query helpers so all packages use a single instance
// and TypeScript treats PgColumn types as compatible everywhere.
export {
  eq, ne, gt, gte, lt, lte,
  and, or, not,
  isNull, isNotNull,
  inArray, notInArray,
  like, ilike,
  sql,
  asc, desc,
  count, sum, avg, min, max,
  relations,
} from "drizzle-orm";
