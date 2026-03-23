use anyhow::{bail, Result};
use console::style;
use inquire::{Confirm, Select, Text};
use serde::Serialize;

use crate::{client::ApiClient, config, output::Output};

// ── agent scaffold templates ───────────────────────────────────────────────────

const PYTHON_STUB: &str = r#""""
{name} — Maschina agent
{description}
"""

from maschina import Agent, RunInput, RunResult


class {class_name}(Agent):
    async def run(self, input: RunInput) -> RunResult:
        # TODO: implement your agent logic here
        prompt = input.payload.get("prompt", "")
        response = await self.model.complete(f"{self.system_prompt}\n\n{prompt}")
        return RunResult(output={"content": response.content})
"#;

const TYPESCRIPT_STUB: &str = r#"import { Agent, RunInput, RunResult } from "@maschina/sdk";

export class {class_name} extends Agent {
  async run(input: RunInput): Promise<RunResult> {
    // TODO: implement your agent logic here
    const prompt = input.payload?.prompt ?? "";
    const response = await this.model.complete(
      `${this.systemPrompt}\n\n${prompt}`
    );
    return { output: { content: response.content } };
  }
}
"#;

const ENV_EXAMPLE: &str = r#"# Maschina agent environment
MASCHINA_API_KEY=msk_your_key_here

# Model provider (choose one or configure in `maschina model add`)
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# OLLAMA_BASE_URL=http://localhost:11434
"#;

// ── main command ──────────────────────────────────────────────────────────────

pub async fn run(name: Option<String>, profile: &str, out: &Output) -> Result<()> {
    let cwd = std::env::current_dir()?;

    // Determine target directory
    let (target_dir, default_name) = if let Some(n) = &name {
        let dir = cwd.join(n);
        (dir, n.clone())
    } else {
        let fallback = cwd
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("my-agent")
            .to_string();
        (cwd.clone(), fallback)
    };

    // Check for existing maschina.toml
    if target_dir.join("maschina.toml").exists() {
        bail!("maschina.toml already exists in {}", target_dir.display());
    }

    println!();
    println!("  {}", style("Initialize a Maschina agent project").bold());
    println!();

    // ── prompts ────────────────────────────────────────────────────────────────

    let agent_name = Text::new("Agent name:")
        .with_default(&default_name)
        .with_placeholder("e.g. market-scanner")
        .prompt()?;

    let description = Text::new("Description:")
        .with_placeholder("What does this agent do?")
        .prompt_skippable()?
        .filter(|s: &String| !s.is_empty());

    let agent_type = Select::new(
        "Agent type:",
        vec![
            "signal       — market / environmental signal detection",
            "analysis     — data analysis and insight extraction",
            "execution    — action execution and automation",
            "optimization — parameter and strategy optimization",
            "reporting    — summary and report generation",
        ],
    )
    .prompt()?;
    let agent_type_key = agent_type.split_whitespace().next().unwrap_or("signal");

    let model = Select::new(
        "Default model:",
        vec![
            "claude-haiku-4-5-20251001   (fast, cheap)",
            "claude-sonnet-4-6           (balanced)",
            "claude-opus-4-6             (most capable)",
            "deepseek-r1:1.5b            (local / Ollama)",
        ],
    )
    .prompt()?;
    let model_key = model
        .split_whitespace()
        .next()
        .unwrap_or("claude-haiku-4-5-20251001");

    let system_prompt = Text::new("System prompt:")
        .with_default(&format!(
            "You are a Maschina {agent_type_key} agent named \"{agent_name}\". Complete the task provided."
        ))
        .prompt()?;

    let language = Select::new("Language:", vec!["Python", "TypeScript"]).prompt()?;
    let is_python = language == "Python";

    println!();

    // ── create files ───────────────────────────────────────────────────────────

    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)?;
    }

    // maschina.toml
    let toml_path = target_dir.join("maschina.toml");
    let desc_line = description
        .as_deref()
        .map(|d| format!("description = \"{d}\"\n"))
        .unwrap_or_default();
    let toml_content = format!(
        r#"[agent]
name = "{agent_name}"
{desc_line}type = "{agent_type_key}"
model = "{model_key}"
system_prompt = "{system_prompt}"

[build]
language = "{lang}"
entrypoint = "{entry}"

[runtime]
timeout_ms = 300000
"#,
        lang = if is_python { "python" } else { "typescript" },
        entry = if is_python { "agent.py" } else { "agent.ts" },
    );
    std::fs::write(&toml_path, &toml_content)?;
    row_created("maschina.toml");

    // agent stub
    let class_name = to_class_name(&agent_name);
    let stub = if is_python {
        PYTHON_STUB
            .replace("{name}", &agent_name)
            .replace("{description}", description.as_deref().unwrap_or(""))
            .replace("{class_name}", &class_name)
    } else {
        TYPESCRIPT_STUB.replace("{class_name}", &class_name)
    };
    let stub_file = if is_python { "agent.py" } else { "agent.ts" };
    let stub_path = target_dir.join(stub_file);
    if !stub_path.exists() {
        std::fs::write(&stub_path, &stub)?;
        row_created(stub_file);
    }

    // .env.example
    let env_path = target_dir.join(".env.example");
    if !env_path.exists() {
        std::fs::write(&env_path, ENV_EXAMPLE)?;
        row_created(".env.example");
    }

    // .gitignore (append .env if not present)
    let gitignore_path = target_dir.join(".gitignore");
    let gitignore_content = if gitignore_path.exists() {
        let existing = std::fs::read_to_string(&gitignore_path)?;
        if !existing.contains(".env") {
            Some(format!("{existing}\n.env\n"))
        } else {
            None
        }
    } else {
        Some(".env\n__pycache__/\nnode_modules/\n".to_string())
    };
    if let Some(content) = gitignore_content {
        std::fs::write(&gitignore_path, content)?;
        row_created(".gitignore");
    }

    // ── offer to push to API ───────────────────────────────────────────────────
    println!();

    let cfg = config::load(profile).unwrap_or_default();
    if cfg.is_authenticated() {
        let push = Confirm::new("Push agent definition to Maschina?")
            .with_default(true)
            .with_help_message("Creates the agent on the platform so you can run it remotely")
            .prompt()
            .unwrap_or(false);

        if push {
            if let Ok(client) = ApiClient::new(&cfg) {
                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct CreateBody<'a> {
                    name: &'a str,
                    #[serde(rename = "type")]
                    agent_type: &'a str,
                    #[serde(skip_serializing_if = "Option::is_none")]
                    description: Option<&'a str>,
                }
                let body = CreateBody {
                    name: &agent_name,
                    agent_type: agent_type_key,
                    description: description.as_deref(),
                };
                match client.post::<_, serde_json::Value>("/agents", &body).await {
                    Ok(agent) => {
                        let id = agent["id"].as_str().unwrap_or("?");
                        println!(
                            "  {}  Agent created  {}",
                            style("✓").green(),
                            style(id).dim()
                        );
                        // Write agent ID into maschina.toml [agent] id field
                        let updated = format!("{toml_content}# platform id\nid = \"{id}\"\n");
                        let _ = std::fs::write(&toml_path, updated);
                    }
                    Err(e) => {
                        out.warn(&format!("Could not push to API: {e}"));
                    }
                }
            }
        }
    } else {
        println!(
            "  {}  Not authenticated — skipping remote push.",
            style("→").dim()
        );
        println!(
            "  Run {} to connect your account.",
            style("maschina setup").cyan()
        );
    }

    // ── summary ────────────────────────────────────────────────────────────────
    println!();
    println!(
        "  {}  Agent project ready in {}",
        style("✓").green().bold(),
        style(target_dir.display().to_string()).cyan()
    );
    println!();
    println!("  Next steps:");
    println!("  {}  {stub_file}", style("→ edit").dim());
    println!(
        "  {}  {}",
        style("→ run").dim(),
        style(format!(
            "maschina agent run <id> --input '{{\"prompt\":\"hello\"}}'"
        ))
        .cyan()
    );
    println!();

    Ok(())
}

// ── helpers ────────────────────────────────────────────────────────────────────

fn row_created(path: &str) {
    println!("  {}  {}", style("✓").green(), style(path).dim());
}

/// Convert a kebab-case name to PascalCase for use as a class name.
fn to_class_name(name: &str) -> String {
    name.split(|c: char| c == '-' || c == '_' || c == ' ')
        .filter(|s| !s.is_empty())
        .map(|s| {
            let mut c = s.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect()
}
