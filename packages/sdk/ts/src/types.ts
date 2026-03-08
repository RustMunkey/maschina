// Public types for the Maschina TypeScript SDK

export type AgentType =
  | "signal"
  | "analysis"
  | "execution"
  | "optimization"
  | "reporting";

export type AgentStatus =
  | "idle"
  | "scanning"
  | "evaluating"
  | "executing"
  | "analyzing"
  | "scaling"
  | "error"
  | "archived";

export type RunStatus =
  | "queued"
  | "executing"
  | "completed"
  | "failed"
  | "timeout"
  | "canceled";

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  agentType: AgentType;
  model: string;
  systemPrompt: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  status: RunStatus;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown> | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  agentType: AgentType;
  model?: string;
  systemPrompt?: string;
  config?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  model?: string;
  systemPrompt?: string;
  config?: Record<string, unknown>;
}

export interface RunAgentInput {
  message: string;
  context?: Record<string, unknown>;
}

export interface Subscription {
  id: string;
  tier: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface UsageSummary {
  tier: string;
  period: string;
  quotas: {
    monthlyAgentRuns: { used: number; limit: number | null };
    monthlyModelTokens: { used: number; limit: number | null };
    concurrentAgents: { used: number; limit: number | null };
    apiCallsPerMinute: { used: number; limit: number | null };
  };
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface CreateKeyInput {
  name: string;
  expiresAt?: string;
}

export interface CreateKeyResponse extends ApiKey {
  key: string;
}

export interface MaschinaClientOptions {
  apiKey: string;
  baseUrl?: string;
}
