import { deleteUserData, getRetentionDays, queryAuditLogs, toCSV } from "@maschina/compliance";
import { can } from "@maschina/plans";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth);

// Gate all compliance routes to M10+
app.use("*", async (c, next) => {
  const user = c.get("user");
  if (!can.useCompliance(user.tier)) {
    throw new HTTPException(403, {
      message: "Compliance tools require the M10 plan or above.",
    });
  }
  return next();
});

// GET /compliance/audit-log?from=&to=&action=&resource=&format=json|csv&limit=&offset=
app.get("/audit-log", async (c) => {
  const { id: userId, tier } = c.get("user");

  const fromStr = c.req.query("from");
  const toStr = c.req.query("to");
  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;
  const format = c.req.query("format") === "csv" ? "csv" : "json";
  const limit = Number(c.req.query("limit") ?? 100);
  const offset = Number(c.req.query("offset") ?? 0);

  if (from && Number.isNaN(from.getTime())) {
    throw new HTTPException(400, { message: "Invalid 'from' date" });
  }
  if (to && Number.isNaN(to.getTime())) {
    throw new HTTPException(400, { message: "Invalid 'to' date" });
  }

  const { rows, total } = await queryAuditLogs({
    userId,
    from,
    to,
    action: c.req.query("action"),
    resource: c.req.query("resource"),
    limit,
    offset,
  });

  if (format === "csv") {
    return c.body(toCSV(rows), 200, {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  }

  return c.json({
    data: rows,
    total,
    limit,
    offset,
    retentionDays: getRetentionDays(tier),
  });
});

// POST /compliance/gdpr/delete — anonymize and purge the requesting user's data
app.post("/gdpr/delete", async (c) => {
  const { id: userId } = c.get("user");

  const result = await deleteUserData(userId);

  return c.json({
    success: true,
    agentsDeleted: result.agentsDeleted,
    runsAnonymized: result.runsAnonymized,
    message: "Your data has been anonymized. Account access will stop working within 60 seconds.",
  });
});

export default app;
