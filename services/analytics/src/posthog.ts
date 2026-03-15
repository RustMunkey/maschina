/**
 * PostHog analytics client.
 * Lazy-initialized — no-ops if POSTHOG_API_KEY is unset.
 */

let _client: import("posthog-node").PostHog | null = null;

async function getClient(): Promise<import("posthog-node").PostHog | null> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;

  if (!_client) {
    const { PostHog } = await import("posthog-node");
    _client = new PostHog(key, {
      host: process.env.POSTHOG_HOST ?? "https://app.posthog.com",
      flushAt: 20,
      flushInterval: 10_000,
    });
  }
  return _client;
}

export interface TrackOptions {
  userId: string;
  event: string;
  properties?: Record<string, unknown>;
}

export async function track(opts: TrackOptions): Promise<void> {
  const client = await getClient();
  if (!client) return;
  client.capture({
    distinctId: opts.userId,
    event: opts.event,
    properties: opts.properties ?? {},
  });
}

export async function identify(userId: string, traits: Record<string, unknown>): Promise<void> {
  const client = await getClient();
  if (!client) return;
  client.identify({ distinctId: userId, properties: traits });
}

export async function shutdown(): Promise<void> {
  if (_client) {
    await _client.shutdown();
    _client = null;
  }
}

// ─── Typed event helpers ──────────────────────────────────────────────────────

export const Analytics = {
  agentCreated: (userId: string, agentId: string, type: string) =>
    track({ userId, event: "agent.created", properties: { agentId, type } }),

  agentDeleted: (userId: string, agentId: string) =>
    track({ userId, event: "agent.deleted", properties: { agentId } }),

  agentRunCompleted: (
    userId: string,
    props: {
      agentId: string;
      runId: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      durationMs: number;
      status: string;
    },
  ) => track({ userId, event: "agent.run.completed", properties: props }),

  userSignedUp: (userId: string, plan: string) =>
    track({ userId, event: "user.signed_up", properties: { plan } }),

  connectorInstalled: (userId: string, slug: string) =>
    track({ userId, event: "connector.installed", properties: { slug } }),

  subscriptionUpgraded: (userId: string, fromTier: string, toTier: string) =>
    track({ userId, event: "subscription.upgraded", properties: { fromTier, toTier } }),

  orgCreated: (userId: string, orgId: string) =>
    track({ userId, event: "org.created", properties: { orgId } }),
};
