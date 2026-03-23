use anyhow::Result;
use console::style;
use indicatif::{ProgressBar, ProgressStyle};
use inquire::{Select, Text};
use serde::{Deserialize, Serialize};
use std::time::Duration;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct RunStatus {
    id: String,
    agent_id: String,
    status: String,
    #[serde(default)]
    output_payload: Option<serde_json::Value>,
    #[serde(default)]
    input_tokens: Option<u64>,
    #[serde(default)]
    output_tokens: Option<u64>,
    #[serde(default)]
    error_code: Option<String>,
    #[serde(default)]
    error_message: Option<String>,
    #[serde(default)]
    started_at: Option<String>,
    #[serde(default)]
    finished_at: Option<String>,
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
        style("ID").dim(),
        style("NAME").dim(),
        style("TYPE").dim(),
        style("STATUS").dim()
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
    let agent_type = selected
        .split_whitespace()
        .next()
        .unwrap_or("signal")
        .to_string();

    let description = Text::new("Description (optional):")
        .prompt_skippable()?
        .filter(|s: &String| !s.is_empty());

    let body = CreateAgentBody {
        name: name.clone(),
        agent_type,
        description,
    };
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
    println!(
        "  Run it:  {}",
        style(format!("maschina agent run {}", &agent.id)).cyan()
    );

    Ok(())
}

pub async fn stop(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client.delete(&format!("/agents/{id}")).await?;
    out.success(&format!("Agent {} deleted", style(&id).dim()), None::<()>);
    Ok(())
}

pub async fn run_agent(
    client: &ApiClient,
    id: String,
    payload: serde_json::Value,
    no_wait: bool,
    out: &Output,
) -> Result<()> {
    let run: AgentRun = client
        .post(&format!("/agents/{id}/run"), &RunBody { input: payload })
        .await?;

    if out.is_json() {
        out.data(&run);
        return Ok(());
    }

    let run_id = &run.run_id;

    if no_wait {
        println!("{} Run queued", style("✓").green().bold());
        println!("  {:<12} {}", style("Run ID:").dim(), style(run_id).cyan());
        println!(
            "  {:<12} {}",
            style("Status:").dim(),
            status_styled(&run.status)
        );
        println!();
        println!(
            "  {}",
            style(format!("maschina logs {run_id}  — follow with -f")).dim()
        );
        return Ok(());
    }

    // ── poll until terminal state ──────────────────────────────────────────────
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
            .template("{spinner:.cyan}  {msg}")
            .unwrap(),
    );
    spinner.set_message(format!("queued  {}", style(run_id.as_str()).dim()));
    spinner.enable_steady_tick(Duration::from_millis(80));

    let mut last_status = run.status.clone();
    let poll_interval = Duration::from_secs(2);
    let timeout = Duration::from_secs(300);
    let started = std::time::Instant::now();

    let final_run = loop {
        tokio::time::sleep(poll_interval).await;

        if started.elapsed() >= timeout {
            spinner.finish_and_clear();
            anyhow::bail!("timed out after 5 minutes — run `maschina logs {run_id}` for details");
        }

        let status: RunStatus = match client.get(&format!("/agents/{id}/runs/{run_id}")).await {
            Ok(s) => s,
            Err(_) => continue,
        };

        if status.status != last_status {
            spinner.set_message(format!(
                "{}  {}",
                &status.status,
                style(run_id.as_str()).dim()
            ));
            last_status = status.status.clone();
        }

        match status.status.as_str() {
            "completed" | "failed" | "error" | "stopped" => {
                spinner.finish_and_clear();
                break status;
            }
            _ => {}
        }
    };

    // ── render result ──────────────────────────────────────────────────────────
    let ok = final_run.status == "completed";

    if ok {
        println!("{} Run completed", style("✓").green().bold());
    } else {
        println!(
            "{} Run {}",
            style("✗").red().bold(),
            style(&final_run.status).red()
        );
    }

    println!(
        "  {:<14} {}",
        style("Run ID:").dim(),
        style(run_id.as_str()).cyan()
    );

    if let (Some(started), Some(finished)) = (&final_run.started_at, &final_run.finished_at) {
        // rough duration: parse as RFC3339 and diff, or just display both
        println!(
            "  {:<14} {}",
            style("Started:").dim(),
            style(started.as_str()).dim()
        );
        println!(
            "  {:<14} {}",
            style("Finished:").dim(),
            style(finished.as_str()).dim()
        );
    }

    if let (Some(i), Some(o)) = (final_run.input_tokens, final_run.output_tokens) {
        println!("  {:<14} {} in / {} out", style("Tokens:").dim(), i, o);
    }

    if ok {
        if let Some(output) = &final_run.output_payload {
            println!();
            // Pretty-print output if it's an object with a "content" or "text" key,
            // otherwise dump the full JSON.
            let text = output["content"]
                .as_str()
                .or_else(|| output["text"].as_str())
                .or_else(|| output["result"].as_str())
                .or_else(|| output["output"].as_str());

            if let Some(t) = text {
                println!("{t}");
            } else {
                println!("{}", serde_json::to_string_pretty(output)?);
            }
        }
    } else {
        if let Some(msg) = &final_run.error_message {
            println!();
            println!("  {} {}", style("Error:").red(), msg);
        }
        println!();
        println!(
            "  {}",
            style(format!("maschina logs {run_id}  — for full trace")).dim()
        );
    }

    println!();
    Ok(())
}

pub async fn runs(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let runs: Vec<AgentRun> = client.get(&format!("/agents/{id}/runs")).await?;

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
        style("RUN ID").dim(),
        style("STATUS").dim(),
        style("STARTED").dim()
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
    let agent: Agent = client.get(&format!("/agents/{id}")).await?;

    if out.is_json() {
        out.data(&agent);
        return Ok(());
    }

    println!();
    println!("  {:<16} {}", style("ID").dim(), style(&agent.id).cyan());
    println!("  {:<16} {}", style("Name").dim(), &agent.name);
    println!(
        "  {:<16} {}",
        style("Type").dim(),
        style(&agent.agent_type).cyan()
    );
    println!(
        "  {:<16} {}",
        style("Status").dim(),
        status_styled(&agent.status)
    );
    if let Some(desc) = &agent.description {
        println!("  {:<16} {}", style("Description").dim(), desc);
    }
    if let Some(created) = &agent.created_at {
        println!("  {:<16} {}", style("Created").dim(), style(created).dim());
    }
    println!();
    println!(
        "  Run:   {}",
        style(format!("maschina agent run {}", &agent.id)).cyan()
    );
    println!(
        "  Runs:  {}",
        style(format!("maschina agent runs {}", &agent.id)).cyan()
    );
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
