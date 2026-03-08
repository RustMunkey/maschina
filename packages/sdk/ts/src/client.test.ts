import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaschinaClient } from "./client.js";
import { MaschinaError } from "./errors.js";

// Minimal fetch mock
function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

const AGENT = {
  id: "agt_1",
  name: "Test Agent",
  description: null,
  agentType: "execution",
  model: "claude-sonnet-4-6",
  systemPrompt: "You are a test agent.",
  status: "idle",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

let client: MaschinaClient;

beforeEach(() => {
  client = new MaschinaClient({ apiKey: "msk_test_key", baseUrl: "https://api.example.com" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MaschinaClient", () => {
  describe("agents", () => {
    it("listAgents returns array", async () => {
      vi.stubGlobal("fetch", mockFetch(200, [AGENT]));
      const agents = await client.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]?.id).toBe("agt_1");
    });

    it("getAgent returns single agent", async () => {
      vi.stubGlobal("fetch", mockFetch(200, AGENT));
      const agent = await client.getAgent("agt_1");
      expect(agent.name).toBe("Test Agent");
    });

    it("createAgent posts and returns agent", async () => {
      const fetchMock = mockFetch(200, AGENT);
      vi.stubGlobal("fetch", fetchMock);
      const agent = await client.createAgent({ name: "Test Agent", agentType: "execution" });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(agent.id).toBe("agt_1");
    });

    it("deleteAgent sends DELETE and returns void", async () => {
      const fetchMock = mockFetch(204, null);
      vi.stubGlobal("fetch", fetchMock);
      await expect(client.deleteAgent("agt_1")).resolves.toBeUndefined();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("DELETE");
    });

    it("runAgent posts to /run endpoint", async () => {
      const run = {
        id: "run_1",
        agentId: "agt_1",
        status: "queued",
        inputPayload: { message: "hello" },
        outputPayload: null,
        inputTokens: null,
        outputTokens: null,
        durationMs: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
      };
      const fetchMock = mockFetch(200, run);
      vi.stubGlobal("fetch", fetchMock);
      const result = await client.runAgent("agt_1", { message: "hello" });
      expect(result.status).toBe("queued");
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("/agents/agt_1/run");
    });
  });

  describe("keys", () => {
    it("createKey returns key with raw value", async () => {
      const fetchMock = mockFetch(200, {
        id: "key_1",
        name: "my key",
        keyPrefix: "msk_live_xxxx",
        createdAt: "2026-01-01T00:00:00Z",
        lastUsedAt: null,
        expiresAt: null,
        key: "msk_live_xxxxxxxxxxxx",
      });
      vi.stubGlobal("fetch", fetchMock);
      const result = await client.createKey({ name: "my key" });
      expect(result.key).toBe("msk_live_xxxxxxxxxxxx");
    });
  });

  describe("errors", () => {
    it("throws MaschinaError on 401", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: () =>
            Promise.resolve({ error: { message: "Invalid API key", code: "unauthorized" } }),
        } as unknown as Response),
      );
      await expect(client.listAgents()).rejects.toThrow(MaschinaError);
    });

    it("MaschinaError carries status and code", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          json: () =>
            Promise.resolve({ error: { message: "Rate limit exceeded", code: "rate_limited" } }),
        } as unknown as Response),
      );
      try {
        await client.listAgents();
      } catch (e) {
        expect(e).toBeInstanceOf(MaschinaError);
        expect((e as MaschinaError).status).toBe(429);
        expect((e as MaschinaError).code).toBe("rate_limited");
      }
    });
  });

  describe("auth header", () => {
    it("sends Authorization header with api key", async () => {
      const fetchMock = mockFetch(200, []);
      vi.stubGlobal("fetch", fetchMock);
      await client.listAgents();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)?.Authorization).toBe("Bearer msk_test_key");
    });
  });
});
