use crate::{client::ApiClient, output::Output};
use anyhow::Result;
use console::style;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentRun {
    id: String,
    agent_id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
    created_at: Option<String>,
    completed_at: Option<String>,
}

pub async fn show(client: &ApiClient, run_id: String, out: &Output) -> Result<()> {
    // Try GET /agents/runs/:id — fallback path for run lookup
    let run: AgentRun = client
        .get(&format!("/agents/runs/{run_id}"))
        .await
        .map_err(|_| anyhow::anyhow!("run not found: {run_id}"))?;

    if out.is_json() {
        out.data(&run);
        return Ok(());
    }

    println!("{}", style("Run details").bold());
    println!("  {:<14} {}", style("Run ID:").dim(), style(&run.id).cyan());
    println!(
        "  {:<14} {}",
        style("Agent:").dim(),
        style(&run.agent_id).dim()
    );
    println!(
        "  {:<14} {}",
        style("Status:").dim(),
        status_styled(&run.status)
    );
    if let Some(started) = &run.created_at {
        println!("  {:<14} {}", style("Started:").dim(), started);
    }
    if let Some(done) = &run.completed_at {
        println!("  {:<14} {}", style("Completed:").dim(), done);
    }
    if let Some(err) = &run.error_message {
        println!("  {:<14} {}", style("Error:").dim(), style(err).red());
    }
    if let Some(output) = &run.output_payload {
        println!();
        println!("{}", style("Output:").bold());
        println!("{}", serde_json::to_string_pretty(output)?);
    }

    Ok(())
}

fn status_styled(s: &str) -> console::StyledObject<&str> {
    match s {
        "completed" => style(s).green(),
        "failed" | "error" => style(s).red(),
        "running" | "executing" => style(s).yellow(),
        "queued" => style(s).cyan(),
        _ => style(s).white(),
    }
}
