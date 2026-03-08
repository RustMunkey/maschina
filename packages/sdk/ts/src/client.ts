import { MaschinaError } from "./errors.js";
import type {
  Agent,
  AgentRun,
  ApiKey,
  CreateAgentInput,
  CreateKeyInput,
  CreateKeyResponse,
  MaschinaClientOptions,
  RunAgentInput,
  Subscription,
  UpdateAgentInput,
  UsageSummary,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.maschina.io";

export class MaschinaClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: MaschinaClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;
  }

  // ── Agents ─────────────────────────────────────────────────────────────────

  async listAgents(): Promise<Agent[]> {
    return this.get("/agents");
  }

  async getAgent(id: string): Promise<Agent> {
    return this.get(`/agents/${id}`);
  }

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    return this.post("/agents", input);
  }

  async updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
    return this.patch(`/agents/${id}`, input);
  }

  async deleteAgent(id: string): Promise<void> {
    return this.delete(`/agents/${id}`);
  }

  async runAgent(id: string, input: RunAgentInput): Promise<AgentRun> {
    return this.post(`/agents/${id}/run`, input);
  }

  async listAgentRuns(id: string): Promise<AgentRun[]> {
    return this.get(`/agents/${id}/runs`);
  }

  // ── API Keys ────────────────────────────────────────────────────────────────

  async listKeys(): Promise<ApiKey[]> {
    return this.get("/keys");
  }

  async createKey(input: CreateKeyInput): Promise<CreateKeyResponse> {
    return this.post("/keys", input);
  }

  async revokeKey(id: string): Promise<void> {
    return this.delete(`/keys/${id}`);
  }

  // ── Usage & Billing ─────────────────────────────────────────────────────────

  async getUsage(): Promise<UsageSummary> {
    return this.get("/usage/summary");
  }

  async getSubscription(): Promise<Subscription | null> {
    return this.get("/billing/subscription");
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...init?.headers,
      },
    });

    if (!res.ok) {
      throw await MaschinaError.fromResponse(res);
    }

    // 204 No Content
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  }

  private delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}
