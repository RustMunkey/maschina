# Maschina TypeScript SDK

Official TypeScript/JavaScript SDK for the [Maschina](https://maschina.ai) API — infrastructure for autonomous digital labor.

[![npm](https://img.shields.io/npm/v/@maschina/sdk)](https://www.npmjs.com/package/@maschina/sdk)
[![CI](https://github.com/maschina-labs/sdk-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/maschina-labs/sdk-typescript/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Installation

```bash
npm install @maschina/sdk
# or
pnpm add @maschina/sdk
# or
yarn add @maschina/sdk
```

## Quick start

```typescript
import { MaschinaClient } from "@maschina/sdk";

const client = new MaschinaClient({ apiKey: process.env.MASCHINA_API_KEY! });

// Create an agent
const agent = await client.createAgent({
  name: "Research Assistant",
  agentType: "analysis",
  model: "claude-sonnet-4-6",
  systemPrompt: "You are a thorough research assistant. Analyze topics deeply and return structured findings.",
});

// Run it
const run = await client.runAgent(agent.id, {
  message: "Research the latest advances in autonomous AI agents and summarize key trends.",
});

console.log(run.outputPayload);
```

## Authentication

Get your API key from [app.maschina.ai/keys](https://app.maschina.ai/keys).

```typescript
const client = new MaschinaClient({
  apiKey: "msk_...",           // required
  baseUrl: "https://api.maschina.ai", // optional, defaults to production
});
```

## API Reference

### Agents

```typescript
// List all agents
const agents = await client.listAgents();

// Get a single agent
const agent = await client.getAgent("agent-id");

// Create an agent
const agent = await client.createAgent({
  name: "My Agent",
  agentType: "execution",   // signal | analysis | execution | optimization | reporting
  model: "claude-sonnet-4-6",
  systemPrompt: "You are...",
  config: { temperature: 0.7 },
});

// Update an agent
const updated = await client.updateAgent("agent-id", {
  name: "Updated Name",
  systemPrompt: "New prompt",
});

// Delete an agent
await client.deleteAgent("agent-id");
```

### Running agents

```typescript
// Trigger a run
const run = await client.runAgent("agent-id", {
  message: "Your task or prompt here",
  context: { key: "additional context" },
});

// Poll for completion
const runs = await client.listAgentRuns("agent-id");
```

### API Keys

```typescript
// List keys
const keys = await client.listKeys();

// Create a key
const { key } = await client.createKey({
  name: "Production key",
  expiresAt: "2027-01-01T00:00:00Z", // optional
});
// key is only returned once — save it immediately

// Revoke a key
await client.revokeKey("key-id");
```

### Billing & Usage

```typescript
// Current usage
const usage = await client.getUsage();
console.log(usage.quotas.monthlyModelTokens);
// { used: 1200000, limit: 5000000 }

// Subscription details
const subscription = await client.getSubscription();
console.log(subscription.tier); // "m5"
```

## Agent types

| Type | Purpose |
|------|---------|
| `signal` | Market or event signal detection |
| `analysis` | Deep analysis and research |
| `execution` | Task execution and automation |
| `optimization` | Continuous improvement loops |
| `reporting` | Structured report generation |

## Models

| Model | Tier required |
|-------|--------------|
| `claude-haiku-4-5` | M1+ |
| `claude-sonnet-4-6` | M5+ |
| `claude-opus-4-6` | M10+ |
| `gpt-4o` | M5+ |
| `gpt-4o-mini` | M1+ |
| `ollama/<model>` | Any (self-hosted nodes) |

## Error handling

```typescript
import { MaschinaClient, MaschinaError } from "@maschina/sdk";

try {
  const agent = await client.getAgent("nonexistent-id");
} catch (err) {
  if (err instanceof MaschinaError) {
    console.error(err.status);  // 404
    console.error(err.message); // "Agent not found"
    console.error(err.code);    // "not_found"
  }
}
```

## TypeScript types

All request and response types are exported:

```typescript
import type {
  Agent,
  AgentRun,
  AgentType,
  CreateAgentInput,
  RunAgentInput,
  UsageSummary,
} from "@maschina/sdk";
```

## Examples

See [`examples/`](examples/) for runnable code:

- [`quickstart.ts`](examples/quickstart.ts) — create and run an agent in 10 lines
- [`run-agent.ts`](examples/run-agent.ts) — run with polling until completion
- [`manage-keys.ts`](examples/manage-keys.ts) — API key lifecycle

## Requirements

- Node.js 18+
- TypeScript 5+ (if using TypeScript)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0 © [Maschina Labs](https://github.com/maschina-labs)
