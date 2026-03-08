use anyhow::Result;
use console::style;
use inquire::{Select, Text};
use serde::{Deserialize, Serialize};

use crate::{client::ApiClient, output::Output};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Agent {
    id: String,
    name: String,
    #[serde(rename = "type")]
    agent_type: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateAgentBody {
    name: String,
    #[serde(rename = "type")]
    agent_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentRun {
    run_id: String,
    agent_id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    started_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunBody {
    input: serde_json::Value,
}

pub async fn list(client: &ApiClient, out: &Output) -> Result<()> {
    let agents: Vec<Agent> = client.get("/agents").await?;

    if out.is_json() {
        out.list(&agents);
        return Ok(());
    }

    if agents.is_empty() {
        println!("No agents yet. Create one with `maschina agent deploy <name>`.");
        return Ok(());
    }

    println!(
        "  {:<38} {:<20} {:<14} {}",
        style("ID").dim(), style("NAME").dim(), style("TYPE").dim(), style("STATUS").dim()
    );
    for a in &agents {
        println!(
            "  {:<38} {:<20} {:<14} {}",
            style(&a.id).dim(),
            &a.name,
            style(&a.agent_type).cyan(),
            status_styled(&a.status),
        );
    }
    Ok(())
}

pub async fn deploy(client: &ApiClient, name: String, out: &Output) -> Result<()> {
    let type_options = vec![
        "signal      — market/environmental signal detection",
        "analysis    — data analysis and insight extraction",
        "execution   — action execution and automation",
        "optimization — parameter and strategy optimization",
        "reporting   — summary and report generation",
    ];

    let selected = Select::new("Agent type:", type_options).prompt()?;
    let agent_type = selected.split_whitespace().next().unwrap_or("signal").to_string();

    let description = Text::new("Description (optional):")
        .prompt_skippable()?
        .filter(|s: &String| !s.is_empty());

    let body = CreateAgentBody { name: name.clone(), agent_type, description };
    let agent: Agent = client.post("/agents", &body).await?;

    if out.is_json() {
        out.data(&agent);
        return Ok(());
    }

    println!("{} Agent deployed", style("✓").green().bold());
    println!("  {:<12} {}", style("ID:").dim(), style(&agent.id).cyan());
    println!("  {:<12} {}", style("Name:").dim(), &agent.name);
    println!("  {:<12} {}", style("Type:").dim(), &agent.agent_type);
    println!();
    println!("  Run it:  {}", style(format!("maschina agent run {}", &agent.id)).cyan());

    Ok(())
}

pub async fn stop(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client.delete(&format!("/agents/{}", id)).await?;
    out.success(&format!("Agent {} deleted", style(&id).dim()), None::<()>);
    Ok(())
}

pub async fn run_agent(client: &ApiClient, id: String, payload: serde_json::Value, out: &Output) -> Result<()> {
    let run: AgentRun = client.post(&format!("/agents/{}/run", id), &RunBody { input: payload }).await?;

    if out.is_json() {
        out.data(&run);
        return Ok(());
    }

    println!("{} Agent run queued", style("✓").green().bold());
    println!("  {:<12} {}", style("Run ID:").dim(), style(&run.run_id).cyan());
    println!("  {:<12} {}", style("Status:").dim(), status_styled(&run.status));
    println!();
    println!("  View logs:  {}", style(format!("maschina logs {}", &run.run_id)).cyan());

    Ok(())
}

pub async fn runs(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let runs: Vec<AgentRun> = client.get(&format!("/agents/{}/runs", id)).await?;

    if out.is_json() {
        out.list(&runs);
        return Ok(());
    }

    if runs.is_empty() {
        println!("  No runs yet for agent {}", style(&id).dim());
        return Ok(());
    }

    println!(
        "  {:<38} {:<16} {}",
        style("RUN ID").dim(), style("STATUS").dim(), style("STARTED").dim()
    );
    for r in &runs {
        let started = r.started_at.as_deref().unwrap_or("—");
        println!(
            "  {:<38} {:<16} {}",
            style(&r.run_id).dim(),
            status_styled(&r.status),
            style(started).dim(),
        );
    }
    Ok(())
}

pub async fn inspect(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let agent: Agent = client.get(&format!("/agents/{}", id)).await?;

    if out.is_json() {
        out.data(&agent);
        return Ok(());
    }

    println!();
    println!("  {:<16} {}", style("ID").dim(),          style(&agent.id).cyan());
    println!("  {:<16} {}", style("Name").dim(),        &agent.name);
    println!("  {:<16} {}", style("Type").dim(),        style(&agent.agent_type).cyan());
    println!("  {:<16} {}", style("Status").dim(),      status_styled(&agent.status));
    if let Some(desc) = &agent.description {
        println!("  {:<16} {}", style("Description").dim(), desc);
    }
    if let Some(created) = &agent.created_at {
        println!("  {:<16} {}", style("Created").dim(), style(created).dim());
    }
    println!();
    println!("  Run:   {}", style(format!("maschina agent run {}", &agent.id)).cyan());
    println!("  Runs:  {}", style(format!("maschina agent runs {}", &agent.id)).cyan());
    println!();
    Ok(())
}

fn status_styled(s: &str) -> console::StyledObject<&str> {
    match s {
        "idle" => style(s).dim(),
        "running" | "executing" | "scanning" => style(s).yellow(),
        "completed" => style(s).green(),
        "failed" | "error" | "stopped" => style(s).red(),
        "queued" => style(s).cyan(),
        _ => style(s).white(),
    }
}
