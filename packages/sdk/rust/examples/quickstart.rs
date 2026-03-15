//! Maschina Rust SDK — quickstart
//!
//! Creates an analysis agent and runs it.
//!
//! Prerequisites:
//!   export MASCHINA_API_KEY=msk_...
//!   cargo run --example quickstart

use maschina_sdk::{
    types::{AgentType, CreateAgentInput, RunAgentInput},
    MaschinaClient,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = std::env::var("MASCHINA_API_KEY").expect("MASCHINA_API_KEY not set");
    let client = MaschinaClient::new(api_key);

    // Create an agent
    let agent = client
        .create_agent(&CreateAgentInput {
            name: "Research Assistant".into(),
            agent_type: AgentType::Analysis,
            model: Some("claude-sonnet-4-6".into()),
            system_prompt: Some(
                "You are a concise research assistant. Return structured, actionable summaries."
                    .into(),
            ),
            description: None,
        })
        .await?;

    println!("Created agent: {}", agent.id);

    // Run it
    let run = client
        .run_agent(
            agent.id,
            &RunAgentInput {
                message:
                    "What are the three most impactful use cases for autonomous AI agents in 2025?"
                        .into(),
                context: None,
            },
        )
        .await?;

    println!("Status: {:?}", run.status);
    println!("Output: {:#?}", run.output_payload);

    // Clean up
    client.delete_agent(agent.id).await?;
    println!("Done.");

    Ok(())
}
