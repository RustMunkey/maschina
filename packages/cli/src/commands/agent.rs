use anyhow::Result;
use console::style;
use futures::StreamExt;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunBody {
    input: serde_json::Value,
}

/// SSE event payload from `GET /agents/:id/runs/:runId/events`
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
enum RunEvent {
    #[serde(rename = "run:update")]
    Update { status: String },
    #[serde(rename = "run:complete")]
    Complete {
        status: String,
        output_payload: Option<serde_json::Value>,
        input_tokens: Option<u64>,
        output_tokens: Option<u64>,
        error_code: Option<String>,
        error_message: Option<String>,
        started_at: Option<String>,
        finished_at: Option<String>,
    },
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

    // ── stream events via SSE ─────────────────────────────────────────────────
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
            .template("{spinner:.cyan}  {msg}")
            .unwrap(),
    );
    spinner.set_message(format!("queued  {}", style(run_id.as_str()).dim()));
    spinner.enable_steady_tick(Duration::from_millis(80));

    let sse_path = format!("/agents/{id}/runs/{run_id}/events");
    let resp = client.get_sse(&sse_path).await.map_err(|e| {
        spinner.finish_and_clear();
        e
    })?;

    let mut byte_stream = resp.bytes_stream();
    let mut line_buf = String::new();

    // Result fields filled in once we receive run:complete
    let mut final_status = String::from("unknown");
    let mut output_payload: Option<serde_json::Value> = None;
    let mut input_tokens: Option<u64> = None;
    let mut output_tokens: Option<u64> = None;
    let mut error_message: Option<String> = None;
    let mut started_at: Option<String> = None;
    let mut finished_at: Option<String> = None;

    let timeout = Duration::from_secs(300);
    let started = std::time::Instant::now();

    'outer: loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                spinner.finish_and_clear();
                eprintln!("{} Cancelling run…", style("!").yellow().bold());
                let _ = client
                    .post::<serde_json::Value, serde_json::Value>(
                        &format!("/agents/{id}/runs/{run_id}/cancel"),
                        &serde_json::json!({}),
                    )
                    .await;
                eprintln!("{} Run cancelled", style("✓").green().bold());
                return Ok(());
            }
            chunk = byte_stream.next() => {
                if started.elapsed() >= timeout {
                    spinner.finish_and_clear();
                    anyhow::bail!("timed out after 5 minutes — run `maschina logs {run_id}` for details");
                }

                let chunk = match chunk {
                    Some(c) => c?,
                    None => break,
                };
                let text = String::from_utf8_lossy(&chunk);

                for ch in text.chars() {
                    if ch == '\n' {
                        let line = line_buf.trim().to_string();
                        line_buf.clear();

                        if let Some(data) = line.strip_prefix("data: ") {
                            match serde_json::from_str::<RunEvent>(data) {
                                Ok(RunEvent::Update { status }) => {
                                    spinner.set_message(format!(
                                        "{}  {}",
                                        &status,
                                        style(run_id.as_str()).dim()
                                    ));
                                    final_status = status;
                                }
                                Ok(RunEvent::Complete {
                                    status,
                                    output_payload: op,
                                    input_tokens: it,
                                    output_tokens: ot,
                                    error_message: em,
                                    started_at: sa,
                                    finished_at: fa,
                                    ..
                                }) => {
                                    final_status = status;
                                    output_payload = op;
                                    input_tokens = it;
                                    output_tokens = ot;
                                    error_message = em;
                                    started_at = sa;
                                    finished_at = fa;
                                    spinner.finish_and_clear();
                                    break 'outer;
                                }
                                Err(_) => {} // ignore unknown event types
                            }
                        }
                    } else {
                        line_buf.push(ch);
                    }
                }
            }
        }
    }

    spinner.finish_and_clear();

    // ── render result ──────────────────────────────────────────────────────────
    let ok = final_status == "completed";

    if ok {
        println!("{} Run completed", style("✓").green().bold());
    } else {
        println!(
            "{} Run {}",
            style("✗").red().bold(),
            style(&final_status).red()
        );
    }

    println!(
        "  {:<14} {}",
        style("Run ID:").dim(),
        style(run_id.as_str()).cyan()
    );

    if let (Some(s), Some(f)) = (&started_at, &finished_at) {
        println!(
            "  {:<14} {}",
            style("Started:").dim(),
            style(s.as_str()).dim()
        );
        println!(
            "  {:<14} {}",
            style("Finished:").dim(),
            style(f.as_str()).dim()
        );
    }

    if let (Some(i), Some(o)) = (input_tokens, output_tokens) {
        println!("  {:<14} {} in / {} out", style("Tokens:").dim(), i, o);
    }

    if ok {
        if let Some(output) = &output_payload {
            println!();
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
        if let Some(msg) = &error_message {
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
