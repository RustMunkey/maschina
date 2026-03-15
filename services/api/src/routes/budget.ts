import { getUsageSummary } from "@maschina/usage";
import { Hono } from "hono";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { trackApiCall } from "../middleware/quota.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, trackApiCall);

// ── GET /budget ───────────────────────────────────────────────────────────────
// Returns current period quota usage across all quota types.
// Used by the dashboard budget panel and CLI `maschina status`.

app.get("/", async (c) => {
  const user = c.get("user");
  const summary = await getUsageSummary(user.id, user.tier);
  return c.json(summary);
});

export default app;
