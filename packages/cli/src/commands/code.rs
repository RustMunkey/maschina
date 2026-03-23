// commands/code.rs — interactive agent REPL
//
// `maschina code` drops into an interactive prompt for running agents.
// Slash commands: /agents, /agent <id>, /new, /clear, /help, /exit

use std::io::Write;

use anyhow::Result;
use console::style;

use crate::{client::ApiClient, config};

pub async fn run(profile: &str) -> Result<()> {
    let cfg = config::load(profile)?;
    if !cfg.is_authenticated() {
        anyhow::bail!("not authenticated — run `maschina setup` to get started");
    }
    let client = ApiClient::new(&cfg)?;

    // Load agents
    let agents_val: serde_json::Value =
        client.get("/agents").await.unwrap_or(serde_json::json!([]));
    let agents: Vec<(String, String, String)> = agents_val
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    Some((
                        a["id"].as_str()?.to_string(),
                        a["name"].as_str().unwrap_or("unnamed").to_string(),
                        a["model"].as_str().unwrap_or("").to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();

    if agents.is_empty() {
        eprintln!(
            "  {} no agents found — create one with {}",
            style("○").dim(),
            style("maschina agent deploy <name>").cyan()
        );
        return Ok(());
    }

    // Pick initial agent
    let mut active_idx = 0usize;
    if agents.len() > 1 {
        println!();
        println!("  {} select an agent:", style("◇").dim());
        for (i, (_, name, model)) in agents.iter().enumerate() {
            println!(
                "  {}  {} {}",
                i + 1,
                name,
                style(format!("({model})")).dim()
            );
        }
        println!();
        print!("  {} ", style(">").dim());
        std::io::stdout().flush()?;

        let mut line = String::new();
        std::io::stdin().read_line(&mut line)?;
        if let Ok(n) = line.trim().parse::<usize>() {
            if n >= 1 && n <= agents.len() {
                active_idx = n - 1;
            }
        }
    }

    let (mut active_id, mut active_name, mut active_model) = agents[active_idx].clone();

    // Banner
    println!();
    println!(
        "  {} {}  {}",
        style("maschina code").bold(),
        style("─").dim(),
        style("interactive agent REPL").dim()
    );
    println!(
        "  agent: {}  model: {}",
        style(&active_name).bold(),
        style(&active_model).dim()
    );
    println!(
        "  {}",
        style("/help for commands  /exit to quit  Ctrl+C to abort").dim()
    );
    println!();

    // REPL loop
    loop {
        print!(
            "{} {} ",
            style(format!("[{active_name}]")).dim(),
            style(">").bold()
        );
        std::io::stdout().flush()?;

        let mut input = String::new();
        match std::io::stdin().read_line(&mut input) {
            Ok(0) => break, // EOF / Ctrl+D
            Err(e) => {
                eprintln!("{}", style(format!("error: {e}")).red());
                break;
            }
            _ => {}
        }

        let trimmed = input.trim();
        if trimmed.is_empty() {
            continue;
        }

        // slash commands
        if trimmed.starts_with('/') {
            let parts: Vec<&str> = trimmed.splitn(2, ' ').collect();
            match parts[0] {
                "/exit" | "/quit" => break,
                "/clear" => {
                    print!("\x1B[2J\x1B[1;1H"); // ANSI clear
                    #[allow(unused_imports)]
                    std::io::stdout().flush()?;
                }
                "/new" => {
                    println!("  {} new session started", style("○").dim());
                }
                "/agents" => {
                    println!();
                    for (i, (id, name, model)) in agents.iter().enumerate() {
                        let active = if id == &active_id { " ◀" } else { "" };
                        println!(
                            "  {}  {} {}{}",
                            i + 1,
                            name,
                            style(format!("({model})")).dim(),
                            style(active).dim()
                        );
                    }
                    println!();
                }
                "/agent" => {
                    let target = parts.get(1).map(|s| s.trim()).unwrap_or("");
                    if target.is_empty() {
                        println!("  {} usage: /agent <id-or-name>", style("→").dim());
                        continue;
                    }
                    // match by name or partial id
                    let found = agents.iter().find(|(id, name, _)| {
                        id == target
                            || name.to_lowercase().contains(&target.to_lowercase())
                            || id.starts_with(target)
                    });
                    match found {
                        Some((id, name, model)) => {
                            active_id = id.clone();
                            active_name = name.clone();
                            active_model = model.clone();
                            println!(
                                "  {} switched to {} {}",
                                style("✓").green(),
                                style(&active_name).bold(),
                                style(format!("({})", &active_model)).dim()
                            );
                        }
                        None => {
                            println!(
                                "  {} agent '{}' not found — use /agents to list",
                                style("✗").red(),
                                target
                            );
                        }
                    }
                }
                "/help" => {
                    println!();
                    println!("  {}", style("commands").bold());
                    println!("  {}  run with input", style("/agent <name>").dim());
                    println!("  {}  list all agents", style("/agents").dim());
                    println!("  {}  clear the screen", style("/clear").dim());
                    println!("  {}  start a new run context", style("/new").dim());
                    println!("  {}  exit the REPL", style("/exit").dim());
                    println!();
                }
                _ => {
                    println!(
                        "  {} unknown command. type {} for help.",
                        style("→").dim(),
                        style("/help").dim()
                    );
                }
            }
            continue;
        }

        // run agent
        let payload = serde_json::json!({ "input": trimmed });
        print!("  ");
        std::io::stdout().flush()?;

        match client
            .post::<_, serde_json::Value>(&format!("/agents/{active_id}/run"), &payload)
            .await
        {
            Ok(resp) => {
                let output = resp["outputPayload"]
                    .as_str()
                    .or_else(|| resp["output"].as_str())
                    .or_else(|| resp["result"].as_str())
                    .unwrap_or_else(|| resp.as_str().unwrap_or(""));

                if output.is_empty() {
                    // Try to extract from nested structure
                    if let Some(text) = resp["outputPayload"]["text"].as_str() {
                        println!("{text}");
                    } else {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&resp).unwrap_or_default()
                        );
                    }
                } else {
                    println!("{output}");
                }
            }
            Err(e) => {
                println!("{}", style(format!("error: {e}")).red());
            }
        }
        println!();
    }

    println!();
    println!("  {} bye", style("◇").dim());
    println!();
    Ok(())
}
