import { auditLogs, db } from "@maschina/db";
import { and, asc, desc, gte, lte, sql } from "@maschina/db";

export interface AuditLogQuery {
  userId: string;
  from?: Date;
  to?: Date;
  action?: string;
  resource?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogRow {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Query audit logs for a user with optional date range and filters.
 */
export async function queryAuditLogs(opts: AuditLogQuery): Promise<{
  rows: AuditLogRow[];
  total: number;
}> {
  const limit = Math.min(opts.limit ?? 100, 1000);
  const offset = opts.offset ?? 0;

  const conditions = [sql`${auditLogs.userId} = ${opts.userId}::uuid`];
  if (opts.from) conditions.push(gte(auditLogs.createdAt, opts.from));
  if (opts.to) conditions.push(lte(auditLogs.createdAt, opts.to));
  if (opts.action) conditions.push(sql`${auditLogs.action} = ${opts.action}`);
  if (opts.resource) conditions.push(sql`${auditLogs.resource} = ${opts.resource}`);

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        action: auditLogs.action,
        resource: auditLogs.resource,
        resourceId: auditLogs.resourceId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);

  return {
    rows: rows.map((r: (typeof rows)[number]) => ({
      ...r,
      metadata: r.metadata as Record<string, unknown> | null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
  };
}

/**
 * Convert audit log rows to CSV string.
 */
export function toCSV(rows: AuditLogRow[]): string {
  const headers = ["id", "user_id", "action", "resource", "resource_id", "created_at"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [r.id, r.userId ?? "", r.action, r.resource, r.resourceId ?? "", r.createdAt]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  return lines.join("\n");
}

/**
 * Append a single audit log entry. Fire-and-forget safe.
 */
export async function appendAuditLog(entry: {
  userId: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLogs).values({
    userId: entry.userId,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    metadata: entry.metadata,
  });
}
