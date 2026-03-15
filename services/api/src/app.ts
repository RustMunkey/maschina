import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type { Variables } from "./context.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFound } from "./middleware/error.js";
import agentRoutes from "./routes/agents.js";
import analyticsRoutes from "./routes/analytics.js";
import authRoutes from "./routes/auth.js";
import billingRoutes from "./routes/billing.js";
import budgetRoutes from "./routes/budget.js";
import complianceRoutes from "./routes/compliance.js";
import connectorRoutes from "./routes/connectors.js";
import healthRoutes from "./routes/health.js";
import keyRoutes from "./routes/keys.js";
import marketplaceRoutes from "./routes/marketplace.js";
import memoryRoutes from "./routes/memory.js";
import nodeRoutes from "./routes/nodes.js";
import orgRoutes from "./routes/orgs.js";
import permissionRoutes from "./routes/permissions.js";
import receiptRoutes, { agentReceiptsApp } from "./routes/receipts.js";
import searchRoutes from "./routes/search.js";
import skillRoutes, { catalogApp as skillCatalogRoutes } from "./routes/skills.js";
import storageRoutes from "./routes/storage.js";
import usageRoutes from "./routes/usage.js";
import userRoutes from "./routes/users.js";
import webhookRoutes from "./routes/webhooks.js";
import workflowRoutes from "./routes/workflows.js";

export function createApp() {
  const app = new Hono<{ Variables: Variables }>();

  // ─── Global middleware ────────────────────────────────────────────────────
  app.use("*", logger());
  app.use("*", secureHeaders());
  app.use("*", corsMiddleware);

  // ─── Routes ───────────────────────────────────────────────────────────────
  app.route("/", healthRoutes);
  app.route("/auth", authRoutes);
  app.route("/users", userRoutes);
  app.route("/agents", agentRoutes);
  app.route("/keys", keyRoutes);
  app.route("/usage", usageRoutes);
  app.route("/billing", billingRoutes);
  app.route("/webhooks", webhookRoutes);
  app.route("/search", searchRoutes);
  app.route("/compliance", complianceRoutes);
  app.route("/nodes", nodeRoutes);
  app.route("/orgs", orgRoutes);
  app.route("/connectors", connectorRoutes);
  app.route("/analytics", analyticsRoutes);
  app.route("/budget", budgetRoutes);
  app.route("/agents", memoryRoutes);
  app.route("/agents", skillRoutes);
  app.route("/skills", skillCatalogRoutes);
  app.route("/marketplace", marketplaceRoutes);
  app.route("/workflows", workflowRoutes);
  app.route("/storage", storageRoutes);
  app.route("/receipts", receiptRoutes);
  app.route("/agents", agentReceiptsApp);
  app.route("/agents", permissionRoutes);

  // ─── Error handling ───────────────────────────────────────────────────────
  app.onError(errorHandler);
  app.notFound(notFound);

  return app;
}

export type App = ReturnType<typeof createApp>;
