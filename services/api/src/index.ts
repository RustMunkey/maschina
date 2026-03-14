import { serve } from "@hono/node-server";
import { closeRedis } from "@maschina/cache";
import { connectNats, disconnectNats, ensureStreams } from "@maschina/nats";
import { ensureIndexes } from "@maschina/search";
import { initTelemetry } from "@maschina/telemetry";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { startEmailWorker } from "./jobs/email.js";
import { startWebhookDispatcher } from "./jobs/webhook.js";

// ─── Telemetry (must be first) ────────────────────────────────────────────────
initTelemetry({ serviceName: "maschina-api", serviceVersion: "0.0.0" });

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start() {
  // Connect to NATS and ensure streams exist before accepting traffic
  await connectNats(process.env.NATS_URL ?? "nats://localhost:4222");
  await ensureStreams();
  console.log("[api] NATS connected");

  // Ensure Meilisearch indexes exist (idempotent — safe to call on every boot)
  await ensureIndexes().catch((err) =>
    console.warn("[api] Meilisearch unavailable — search degraded:", err.message),
  );

  // Start background job workers (non-blocking — runs concurrently with HTTP server)
  startEmailWorker().catch((err) => console.error("[email-worker] fatal error", err));
  startWebhookDispatcher().catch((err) => console.error("[webhook-dispatcher] fatal error", err));

  const app = createApp();

  const server = serve({
    fetch: app.fetch,
    port: env.PORT,
  });

  console.log(`[api] Maschina API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);

  // ─── Graceful shutdown ──────────────────────────────────────────────────────

  async function shutdown(signal: string) {
    console.log(`[api] ${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await Promise.allSettled([disconnectNats(), closeRedis()]);
      console.log("[api] Shutdown complete.");
      process.exit(0);
    });

    setTimeout(() => {
      console.error("[api] Forced exit after timeout.");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return app;
}

export const app = await start();
