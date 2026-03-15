import crypto from "node:crypto";
import { encryptCredentials, getConnectorDef, listConnectorDefs } from "@maschina/connectors";
import { and, connectorCredentials, connectorDefinitions, connectors, db, eq } from "@maschina/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { trackApiCall } from "../middleware/quota.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, trackApiCall);

// ── GET /connectors/definitions ───────────────────────────────────────────────

app.get("/definitions", (c) => {
  return c.json(listConnectorDefs());
});

// ── GET /connectors ───────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const { id: userId } = c.get("user");

  const rows = await db
    .select({
      id: connectors.id,
      definitionId: connectors.definitionId,
      name: connectors.name,
      status: connectors.status,
      lastError: connectors.lastError,
      lastConnectedAt: connectors.lastConnectedAt,
      createdAt: connectors.createdAt,
      updatedAt: connectors.updatedAt,
    })
    .from(connectors)
    .where(eq(connectors.userId, userId));

  return c.json(rows);
});

// ── POST /connectors ──────────────────────────────────────────────────────────
// Install an api_key connector (Notion, Linear).

app.post("/", async (c) => {
  const { id: userId } = c.get("user");
  const body = await c.req.json().catch(() => null);

  if (!body?.slug || !body?.credentials || !body?.name) {
    throw new HTTPException(400, { message: "slug, name, and credentials are required" });
  }

  const def = getConnectorDef(body.slug as string);
  if (!def) throw new HTTPException(400, { message: `Unknown connector: ${body.slug}` });
  if (def.authType !== "api_key") {
    throw new HTTPException(400, {
      message: `Use the OAuth flow for ${def.name} (/connectors/oauth/${def.slug}/connect)`,
    });
  }

  // Validate required credential fields
  for (const [field, schema] of Object.entries(def.credentialSchema)) {
    if (schema.required && !body.credentials[field]) {
      throw new HTTPException(400, { message: `Missing required credential: ${field}` });
    }
  }

  // Find or create the connector_definition row
  let [defRow] = await db
    .select()
    .from(connectorDefinitions)
    .where(eq(connectorDefinitions.slug, def.slug));

  if (!defRow) {
    [defRow] = await db
      .insert(connectorDefinitions)
      .values({
        slug: def.slug,
        name: def.name,
        description: def.description,
        category: def.category,
      })
      .returning();
  }

  if (!defRow) throw new HTTPException(500, { message: "Failed to resolve connector definition" });

  // Create connector record
  const [connector] = await db
    .insert(connectors)
    .values({
      userId,
      definitionId: defRow.id,
      name: body.name as string,
      status: "active",
      lastConnectedAt: new Date(),
    })
    .returning();

  if (!connector) throw new HTTPException(500, { message: "Failed to create connector" });

  // Encrypt and store credentials
  const plaintext = JSON.stringify(body.credentials);
  const { encryptedData, iv } = encryptCredentials(plaintext);

  await db.insert(connectorCredentials).values({
    connectorId: connector.id,
    encryptedData,
    iv,
  });

  return c.json({ ...connector, slug: def.slug }, 201);
});

// ── GET /connectors/:id ───────────────────────────────────────────────────────

app.get("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const connectorId = c.req.param("id");

  const [row] = await db
    .select()
    .from(connectors)
    .where(and(eq(connectors.id, connectorId), eq(connectors.userId, userId)));

  if (!row) throw new HTTPException(404, { message: "Connector not found" });

  return c.json(row);
});

// ── DELETE /connectors/:id ────────────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const connectorId = c.req.param("id");

  const [deleted] = await db
    .delete(connectors)
    .where(and(eq(connectors.id, connectorId), eq(connectors.userId, userId)))
    .returning();

  if (!deleted) throw new HTTPException(404, { message: "Connector not found" });

  return c.json({ success: true });
});

// ── GET /connectors/oauth/:slug/connect ───────────────────────────────────────
// Redirect the user's browser to the provider's OAuth authorization page.

app.get("/oauth/:slug/connect", async (c) => {
  const { id: userId } = c.get("user");
  const slug = c.req.param("slug");

  const def = getConnectorDef(slug);
  if (!def || def.authType !== "oauth2" || !def.oauthConfig) {
    throw new HTTPException(400, { message: `No OAuth flow for connector: ${slug}` });
  }

  const clientId = process.env[`${slug.toUpperCase()}_CLIENT_ID`];
  if (!clientId) {
    throw new HTTPException(500, {
      message: `${slug.toUpperCase()}_CLIENT_ID is not configured`,
    });
  }

  // State: HMAC-signed userId+slug+nonce to prevent CSRF
  const nonce = crypto.randomBytes(16).toString("hex");
  const statePayload = `${userId}:${slug}:${nonce}`;
  const secret = process.env.JWT_SECRET ?? "dev-secret";
  const sig = crypto.createHmac("sha256", secret).update(statePayload).digest("hex");
  const state = Buffer.from(`${statePayload}:${sig}`).toString("base64url");

  const redirectUri = `${process.env.API_BASE_URL ?? "http://localhost:8000"}/connectors/oauth/${slug}/callback`;

  const url = new URL(def.oauthConfig.authorizationUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", def.oauthConfig.scopes.join(" "));
  url.searchParams.set("state", state);
  if (slug === "github") url.searchParams.set("allow_signup", "false");

  return c.redirect(url.toString());
});

// ── GET /connectors/oauth/:slug/callback ──────────────────────────────────────
// OAuth provider redirects here after the user grants access.

app.get("/oauth/:slug/callback", async (c) => {
  const slug = c.req.param("slug");
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    throw new HTTPException(400, { message: "Missing code or state" });
  }

  const def = getConnectorDef(slug);
  if (!def || def.authType !== "oauth2" || !def.oauthConfig) {
    throw new HTTPException(400, { message: `No OAuth flow for: ${slug}` });
  }

  // Verify state signature
  const secret = process.env.JWT_SECRET ?? "dev-secret";
  const decoded = Buffer.from(state, "base64url").toString("utf8");
  const parts = decoded.split(":");
  if (parts.length !== 4) throw new HTTPException(400, { message: "Invalid state" });

  const [userId, stateslug, nonce, receivedSig] = parts as [string, string, string, string];
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${stateslug}:${nonce}`)
    .digest("hex");

  if (receivedSig !== expected || stateslug !== slug) {
    throw new HTTPException(400, { message: "Invalid state signature" });
  }

  // Exchange code for access token
  const clientId = process.env[`${slug.toUpperCase()}_CLIENT_ID`] ?? "";
  const clientSecret = process.env[`${slug.toUpperCase()}_CLIENT_SECRET`] ?? "";
  const redirectUri = `${process.env.API_BASE_URL ?? "http://localhost:8000"}/connectors/oauth/${slug}/callback`;

  const tokenRes = await fetch(def.oauthConfig.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    throw new HTTPException(502, { message: "Failed to exchange OAuth code" });
  }

  const tokenData = (await tokenRes.json()) as Record<string, unknown>;
  const accessToken =
    slug === "slack"
      ? ((tokenData.authed_user as Record<string, unknown>)?.access_token ?? tokenData.access_token)
      : tokenData.access_token;

  if (!accessToken || typeof accessToken !== "string") {
    throw new HTTPException(502, { message: "No access token in provider response" });
  }

  // Find or create the connector_definition row
  let [defRow] = await db
    .select()
    .from(connectorDefinitions)
    .where(eq(connectorDefinitions.slug, slug));

  if (!defRow) {
    [defRow] = await db
      .insert(connectorDefinitions)
      .values({
        slug: def.slug,
        name: def.name,
        description: def.description,
        category: def.category,
      })
      .returning();
  }

  if (!defRow) throw new HTTPException(500, { message: "Failed to resolve connector definition" });

  // Upsert connector record
  const [connector] = await db
    .insert(connectors)
    .values({
      userId,
      definitionId: defRow.id,
      name: def.name,
      status: "active",
      lastConnectedAt: new Date(),
    })
    .returning();

  if (!connector) throw new HTTPException(500, { message: "Failed to create connector" });

  // Encrypt and store token
  const { encryptedData, iv } = encryptCredentials(JSON.stringify({ access_token: accessToken }));
  await db
    .insert(connectorCredentials)
    .values({ connectorId: connector.id, encryptedData, iv })
    .onConflictDoUpdate({
      target: [connectorCredentials.connectorId],
      set: { encryptedData, iv, updatedAt: new Date() },
    });

  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return c.redirect(`${appUrl}/connectors?connected=${slug}`);
});

// ── POST /connectors/webhooks/:slug ───────────────────────────────────────────
// Receive incoming webhooks from Slack / GitHub / Linear.
// Verifies the provider signature before processing.

app.post("/webhooks/:slug", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.text();

  switch (slug) {
    case "slack": {
      // Slack uses X-Slack-Signature: v0=HMAC-SHA256(v0:<timestamp>:<body>)
      const ts = c.req.header("x-slack-request-timestamp") ?? "";
      const sig = c.req.header("x-slack-signature") ?? "";
      const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";

      const age = Math.abs(Date.now() / 1000 - Number(ts));
      if (age > 300) throw new HTTPException(400, { message: "Request too old" });

      const expected = `v0=${crypto.createHmac("sha256", signingSecret).update(`v0:${ts}:${body}`).digest("hex")}`;

      if (sig !== expected) throw new HTTPException(401, { message: "Invalid Slack signature" });

      const payload = JSON.parse(body) as Record<string, unknown>;
      // URL verification challenge
      if (payload.type === "url_verification") {
        return c.json({ challenge: payload.challenge });
      }
      // TODO: route event to relevant agent workflow via NATS
      break;
    }

    case "github": {
      // GitHub uses X-Hub-Signature-256: sha256=HMAC-SHA256(body)
      const sig = c.req.header("x-hub-signature-256") ?? "";
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? "";

      const expected = `sha256=${crypto.createHmac("sha256", webhookSecret).update(body).digest("hex")}`;

      if (sig !== expected) throw new HTTPException(401, { message: "Invalid GitHub signature" });

      // TODO: route event to relevant agent workflow via NATS
      break;
    }

    case "linear": {
      // Linear uses Linear-Signature: HMAC-SHA256(body)
      const sig = c.req.header("linear-signature") ?? "";
      const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET ?? "";

      const expected = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");

      if (sig !== expected) throw new HTTPException(401, { message: "Invalid Linear signature" });

      // TODO: route event to relevant agent workflow via NATS
      break;
    }

    default:
      throw new HTTPException(400, { message: `No webhook handler for: ${slug}` });
  }

  return c.json({ received: true });
});

export default app;
