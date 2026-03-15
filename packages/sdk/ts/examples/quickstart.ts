/**
 * Maschina TypeScript SDK — quickstart
 *
 * Creates an analysis agent and runs it against a prompt.
 *
 * Prerequisites:
 *   export MASCHINA_API_KEY=msk_...
 *   npx tsx examples/quickstart.ts
 */

import { MaschinaClient } from "../src/index.js";

const client = new MaschinaClient({
  apiKey:
    process.env.MASCHINA_API_KEY ??
    (() => {
      throw new Error("MASCHINA_API_KEY is not set");
    })(),
});

// 1. Create an agent
const agent = await client.createAgent({
  name: "Research Assistant",
  agentType: "analysis",
  model: "claude-sonnet-4-6",
  systemPrompt:
    "You are a concise research assistant. Analyze topics and return structured, actionable summaries.",
});

console.log(`Created agent: ${agent.id}`);

// 2. Run it
const run = await client.runAgent(agent.id, {
  message: "What are the three most impactful use cases for autonomous AI agents in 2025?",
});

console.log(`Run status: ${run.status}`);
console.log("Output:", run.outputPayload);

// 3. Clean up (optional)
await client.deleteAgent(agent.id);
console.log("Done.");
