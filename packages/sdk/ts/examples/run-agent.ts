/**
 * Maschina TypeScript SDK — polling for run completion
 *
 * Runs an agent and polls until the run reaches a terminal state.
 *
 * Prerequisites:
 *   export MASCHINA_API_KEY=msk_...
 *   export MASCHINA_AGENT_ID=<existing-agent-id>
 *   npx tsx examples/run-agent.ts
 */

import { MaschinaClient, MaschinaError } from "../src/index.js";
import type { RunStatus } from "../src/index.js";

const TERMINAL: RunStatus[] = ["completed", "failed", "timeout", "canceled"];
const POLL_INTERVAL_MS = 2000;

async function pollUntilDone(
  client: MaschinaClient,
  agentId: string,
  runId: string,
  timeoutMs = 120_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const runs = await client.listAgentRuns(agentId);
    const run = runs.find((r) => r.id === runId);

    if (!run) throw new Error(`Run ${runId} not found`);

    console.log(`  status: ${run.status}`);

    if (TERMINAL.includes(run.status)) {
      return run;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error("Timed out waiting for run to complete");
}

const client = new MaschinaClient({
  apiKey:
    process.env.MASCHINA_API_KEY ??
    (() => {
      throw new Error("MASCHINA_API_KEY is not set");
    })(),
});
const agentId =
  process.env.MASCHINA_AGENT_ID ??
  (() => {
    throw new Error("MASCHINA_AGENT_ID is not set");
  })();

try {
  console.log("Triggering run...");
  const run = await client.runAgent(agentId, {
    message: "Summarise the key benefits of multi-agent workflows in three bullet points.",
  });

  console.log(`Run started: ${run.id}`);
  const completed = await pollUntilDone(client, agentId, run.id);

  if (completed.status === "completed") {
    console.log("\nOutput:", completed.outputPayload);
  } else {
    console.error("Run failed:", completed.errorMessage);
    process.exit(1);
  }
} catch (err) {
  if (err instanceof MaschinaError) {
    console.error(`API error ${err.status}: ${err.message}`);
  } else {
    throw err;
  }
}
