/**
 * LangSmith tracing client.
 * Lazy-initialized — no-ops if LANGSMITH_API_KEY is unset.
 *
 * Each agent run gets a top-level LangSmith run that records:
 *   - model, input/output tokens, latency, status
 *   - run_id for correlation with agent_runs table
 */

export interface LangSmithRunParams {
  runId: string;
  agentId: string;
  userId: string;
  model: string;
  input: string;
}

export interface LangSmithRunResult {
  output: string;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

const LANGSMITH_API = "https://api.smith.langchain.com";

function getKey(): string | null {
  return process.env.LANGSMITH_API_KEY ?? null;
}

function getProject(): string {
  return process.env.LANGSMITH_PROJECT ?? "maschina";
}

async function post(path: string, body: unknown): Promise<void> {
  const key = getKey();
  if (!key) return;

  await fetch(`${LANGSMITH_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
  }).catch(() => {
    // LangSmith is non-critical — never throw
  });
}

async function patch(path: string, body: unknown): Promise<void> {
  const key = getKey();
  if (!key) return;

  await fetch(`${LANGSMITH_API}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export async function startTrace(params: LangSmithRunParams): Promise<string | null> {
  const key = getKey();
  if (!key) return null;

  const traceId = params.runId;

  await post("/runs", {
    id: traceId,
    name: `agent:${params.agentId}`,
    run_type: "llm",
    start_time: new Date().toISOString(),
    inputs: { message: params.input },
    extra: {
      model: params.model,
      agentId: params.agentId,
      userId: params.userId,
    },
    session_name: getProject(),
  });

  return traceId;
}

export async function endTrace(traceId: string, result: LangSmithRunResult): Promise<void> {
  const key = getKey();
  if (!key) return;

  await patch(`/runs/${traceId}`, {
    end_time: new Date().toISOString(),
    outputs: { output: result.output },
    extra: {
      usage: {
        prompt_tokens: result.inputTokens,
        completion_tokens: result.outputTokens,
        total_tokens: result.inputTokens + result.outputTokens,
      },
    },
    error: result.error ?? null,
  });
}

export async function failTrace(traceId: string, error: string): Promise<void> {
  const key = getKey();
  if (!key) return;

  await patch(`/runs/${traceId}`, {
    end_time: new Date().toISOString(),
    error,
  });
}
