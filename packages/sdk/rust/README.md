# Maschina Rust SDK

Official Rust SDK for the [Maschina](https://maschina.ai) API — infrastructure for autonomous digital labor.

[![crates.io](https://img.shields.io/crates/v/maschina-sdk)](https://crates.io/crates/maschina-sdk)
[![CI](https://github.com/maschina-labs/sdk-rust/actions/workflows/ci.yml/badge.svg)](https://github.com/maschina-labs/sdk-rust/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Installation

Add to `Cargo.toml`:

```toml
[dependencies]
maschina-sdk = "0.1"
tokio = { version = "1", features = ["full"] }
```

## Quick start

```rust
use maschina_sdk::{MaschinaClient, types::CreateAgentInput};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = MaschinaClient::new(std::env::var("MASCHINA_API_KEY")?);

    // Create an agent
    let agent = client.create_agent(CreateAgentInput {
        name: "Research Assistant".into(),
        agent_type: "analysis".into(),
        model: Some("claude-sonnet-4-6".into()),
        system_prompt: Some("You are a concise research assistant.".into()),
        ..Default::default()
    }).await?;

    println!("Created agent: {}", agent.id);

    // Run it
    let run = client.run_agent(&agent.id, maschina_sdk::types::RunAgentInput {
        message: "What are the top three use cases for autonomous agents in 2025?".into(),
        context: None,
    }).await?;

    println!("Status: {}", run.status);
    println!("Output: {:?}", run.output_payload);

    // Clean up
    client.delete_agent(&agent.id).await?;
    Ok(())
}
```

## Authentication

Get your API key from [app.maschina.ai/keys](https://app.maschina.ai/keys).

```rust
// Default base URL (https://api.maschina.ai)
let client = MaschinaClient::new("msk_...".to_string());

// Custom base URL
let client = MaschinaClient::with_base_url(
    "msk_...".to_string(),
    "https://api.maschina.ai".to_string(),
);
```

## API Reference

### Agents

```rust
use maschina_sdk::types::{CreateAgentInput, UpdateAgentInput};

// List
let agents = client.list_agents().await?;

// Get
let agent = client.get_agent("agent-id").await?;

// Create
let agent = client.create_agent(CreateAgentInput {
    name: "My Agent".into(),
    agent_type: "execution".into(),
    model: Some("claude-sonnet-4-6".into()),
    system_prompt: Some("You are...".into()),
    description: None,
    config: None,
}).await?;

// Update
let updated = client.update_agent("agent-id", UpdateAgentInput {
    name: Some("New name".into()),
    system_prompt: Some("Updated prompt".into()),
    ..Default::default()
}).await?;

// Delete
client.delete_agent("agent-id").await?;
```

### Running agents

```rust
use maschina_sdk::types::RunAgentInput;

let run = client.run_agent("agent-id", RunAgentInput {
    message: "Your task here".into(),
    context: None,
}).await?;

println!("{}", run.status); // queued | executing | completed | failed | timeout | canceled

// List runs
let runs = client.list_agent_runs("agent-id").await?;
```

### API Keys

```rust
use maschina_sdk::types::CreateKeyInput;

// List
let keys = client.list_keys().await?;

// Create (raw key only returned once)
let response = client.create_key(CreateKeyInput {
    name: "Production key".into(),
    expires_at: None,
}).await?;
println!("{}", response.key); // save immediately

// Revoke
client.revoke_key("key-id").await?;
```

### Billing & Usage

```rust
let usage = client.get_usage().await?;
println!("{}", usage.tier); // "m5"

let sub = client.get_subscription().await?;
println!("{}", sub.status); // "active"
```

## Error handling

```rust
use maschina_sdk::MaschinaError;

match client.get_agent("bad-id").await {
    Ok(agent) => println!("{}", agent.id),
    Err(MaschinaError::Api { status, message, code }) => {
        eprintln!("API error {status}: {message} (code: {code:?})");
    }
    Err(e) => return Err(e.into()),
}
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
| `ollama/<model>` | Any (self-hosted) |

## Examples

See [`examples/`](examples/) for runnable code:

```bash
MASCHINA_API_KEY=msk_... cargo run --example quickstart
```

## Requirements

- Rust 1.75+
- Tokio async runtime

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0 © [Maschina Labs](https://github.com/maschina-labs)
