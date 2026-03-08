import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFound } from "./middleware/error.js";
import healthRoutes  from "./routes/health.js";
import authRoutes    from "./routes/auth.js";
import userRoutes    from "./routes/users.js";
import agentRoutes   from "./routes/agents.js";
import keyRoutes     from "./routes/keys.js";
import usageRoutes   from "./routes/usage.js";
import billingRoutes from "./routes/billing.js";
import webhookRoutes from "./routes/webhooks.js";
import type { Variables } from "./context.js";

export function createApp() {
  const app = new Hono<{ Variables: Variables }>();

  // ─── Global middleware ────────────────────────────────────────────────────
  app.use("*", logger());
  app.use("*", secureHeaders());
  app.use("*", corsMiddleware);

  // ─── Routes ───────────────────────────────────────────────────────────────
  app.route("/",           healthRoutes);
  app.route("/auth",       authRoutes);
  app.route("/users",      userRoutes);
  app.route("/agents",     agentRoutes);
  app.route("/keys",       keyRoutes);
  app.route("/usage",      usageRoutes);
  app.route("/billing",    billingRoutes);
  app.route("/webhooks",   webhookRoutes);

  // ─── Error handling ───────────────────────────────────────────────────────
  app.onError(errorHandler);
  app.notFound(notFound);

  return app;
}

export type App = ReturnType<typeof createApp>;
