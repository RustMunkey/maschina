mod client;
mod commands;
mod config;
mod hardware;
mod output;
mod project;
mod services;
mod tui;

use std::process::Command;

use anyhow::Result;
use clap::{Parser, Subcommand};

// ── CLI definition ────────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(
    name = "maschina",
    about = "The Maschina CLI — infrastructure for autonomous digital labor.\nRun with no arguments to open the launcher.",
    long_about = None,
    version,
    propagate_version = true,
)]
pub struct Cli {
    /// Output raw JSON (useful for scripting and CI)
    #[arg(long, global = true)]
    pub json: bool,

    /// Use a named config profile (default: "default")
    #[arg(long, global = true, default_value = "default")]
    pub profile: String,

    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Interactive first-time setup wizard
    Setup,

    /// Authenticate with email and password
    Login,

    /// Clear stored credentials
    Logout,

    /// Show connection status and account info
    Status,

    /// Check configuration, connectivity, and dependencies
    Doctor,

    /// Manage background services (api, gateway, realtime, runtime, daemon)
    Service {
        #[command(subcommand)]
        cmd: ServiceCommands,
    },

    /// Manage agents
    Agent {
        #[command(subcommand)]
        cmd: AgentCommands,
    },

    /// Manage API keys
    Keys {
        #[command(subcommand)]
        cmd: KeyCommands,
    },

    /// Manage AI model providers
    Model {
        #[command(subcommand)]
        cmd: ModelCommands,
    },

    /// Show quota and token usage
    Usage,

    /// Show logs for an agent run or service
    Logs {
        /// Run ID or service name (api, gateway, realtime, runtime, daemon)
        target: String,
        /// Follow (tail -f)
        #[arg(short, long)]
        follow: bool,
    },

    /// Join or manage the Maschina compute network
    Node {
        #[command(subcommand)]
        cmd: NodeCommands,
    },

    /// Self-update the CLI
    Update,

    /// Open the code tool (REPL)
    Code,

    /// Manage per-project configuration
    Config {
        #[command(subcommand)]
        cmd: ConfigCommands,
    },
}

// ── service ───────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum ServiceCommands {
    /// Start one or all services
    Start {
        /// Service name (api, gateway, realtime, runtime, daemon). Omit for all.
        name: Option<String>,
    },
    /// Stop one or all services
    Stop {
        /// Service name. Omit for all.
        name: Option<String>,
    },
    /// Restart one or all services
    Restart {
        /// Service name. Omit for all.
        name: Option<String>,
    },
    /// Show running status of all services
    Status,
    /// Tail a service log
    Logs {
        /// Service name (api, gateway, realtime, runtime, daemon)
        name: String,
        /// Follow (live tail)
        #[arg(short, long)]
        follow: bool,
    },
}

// ── agent ─────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum AgentCommands {
    /// List all agents
    List,
    /// Deploy a new agent
    Deploy {
        /// Agent name
        name: String,
    },
    /// Stop a running agent
    Stop {
        /// Agent ID
        id: String,
    },
    /// Run an agent
    Run {
        /// Agent ID
        id: String,
        /// JSON input payload
        #[arg(short, long, default_value = "{}")]
        input: String,
    },
    /// Show run history for an agent
    Runs {
        /// Agent ID
        id: String,
    },
    /// Inspect agent config and stats
    Inspect {
        /// Agent ID
        id: String,
    },
    /// Tail logs for an agent's last run
    Logs {
        /// Agent ID
        id: String,
    },
}

// ── keys ──────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum KeyCommands {
    /// List all API keys
    List,
    /// Create a new API key
    Create {
        /// Descriptive name for the key
        name: String,
    },
    /// Revoke an API key
    Revoke {
        /// API key ID
        id: String,
    },
}

// ── models ────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum ModelCommands {
    /// List configured providers
    List,
    /// Show provider status
    Status,
    /// Add or reconfigure a provider (--all to configure all at once)
    Add {
        /// Provider name (anthropic, openai, ollama, openrouter, gemini, mistral, custom)
        name: Option<String>,
        /// Interactively configure all supported providers
        #[arg(long)]
        all: bool,
    },
    /// Remove a provider
    Remove {
        /// Provider name (anthropic, openai, ollama, …)
        name: String,
    },
}

// ── node ──────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum NodeCommands {
    /// Join the network: detect hardware, register, and start processing tasks
    Join,
    /// Leave the network gracefully (marks node offline)
    Leave {
        /// Also clear stored node credentials (allows fresh re-registration)
        #[arg(long)]
        forget: bool,
    },
    /// Show this node's status, reputation score, and earnings
    Status,
}

// ── config ────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum ConfigCommands {
    /// Print the active config file path
    Path,
    /// Get a config value
    Get {
        /// Dot-path key (e.g. api_url)
        key: String,
    },
    /// Set a config value
    Set { key: String, value: String },
}

// ── entry points ──────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("{} {err}", console::style("error:").red().bold());
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let cli = Cli::parse();
    let out = output::Output::new(cli.json);

    match cli.command {
        // ── no args → TUI launcher (loop back after setup) ───────────────────
        None => {
            let mut launch_target = tui::run(&cli.profile)?;
            loop {
                match launch_target {
                    None => break,
                    Some(tui::LaunchTarget::Setup) => {
                        commands::setup::run(&cli.profile).await?;
                        launch_target = tui::run(&cli.profile)?;
                    }
                    Some(tui::LaunchTarget::Code) => {
                        launch_code_tool()?;
                        break;
                    }
                }
            }
        }

        // ── setup ─────────────────────────────────────────────────────────────
        Some(Commands::Setup) => {
            commands::setup::run(&cli.profile).await?;
        }

        // ── login / logout ────────────────────────────────────────────────────
        Some(Commands::Login) => {
            commands::login::run(&cli.profile).await?;
        }

        Some(Commands::Logout) => {
            let mut cfg = config::load(&cli.profile)?;
            cfg.api_key = None;
            cfg.email = None;
            config::save(&cfg, &cli.profile)?;
            out.success("Logged out", None::<()>);
        }

        // ── status / doctor ───────────────────────────────────────────────────
        Some(Commands::Status) => {
            commands::status::run(&cli.profile, &out).await?;
        }

        Some(Commands::Doctor) => {
            commands::doctor::run(&cli.profile, &out).await?;
        }

        // ── service ───────────────────────────────────────────────────────────
        Some(Commands::Service { cmd }) => match cmd {
            ServiceCommands::Start { name } => commands::service::start(name.as_deref(), &out)?,
            ServiceCommands::Stop { name } => commands::service::stop(name.as_deref(), &out)?,
            ServiceCommands::Restart { name } => commands::service::restart(name.as_deref(), &out)?,
            ServiceCommands::Status => commands::service::status(&out)?,
            ServiceCommands::Logs { name, follow } => commands::service::logs(&name, follow)?,
        },

        // ── agents ────────────────────────────────────────────────────────────
        Some(Commands::Agent { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                AgentCommands::List => {
                    commands::agent::list(&client, &out).await?;
                }
                AgentCommands::Deploy { name } => {
                    commands::agent::deploy(&client, name, &out).await?;
                }
                AgentCommands::Stop { id } => {
                    commands::agent::stop(&client, id, &out).await?;
                }
                AgentCommands::Run { id, input } => {
                    let payload: serde_json::Value = serde_json::from_str(&input)
                        .map_err(|_| anyhow::anyhow!("--input must be valid JSON"))?;
                    commands::agent::run_agent(&client, id, payload, &out).await?;
                }
                AgentCommands::Runs { id } => {
                    commands::agent::runs(&client, id, &out).await?;
                }
                AgentCommands::Inspect { id } => {
                    commands::agent::inspect(&client, id, &out).await?;
                }
                AgentCommands::Logs { id } => {
                    commands::logs::show(&client, id, &out).await?;
                }
            }
        }

        // ── keys ──────────────────────────────────────────────────────────────
        Some(Commands::Keys { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                KeyCommands::List => commands::keys::list(&client, &out).await?,
                KeyCommands::Create { name } => commands::keys::create(&client, name, &out).await?,
                KeyCommands::Revoke { id } => commands::keys::revoke(&client, id, &out).await?,
            }
        }

        // ── models ────────────────────────────────────────────────────────────
        Some(Commands::Model { cmd }) => match cmd {
            ModelCommands::List => models_list(&cli.profile, &out)?,
            ModelCommands::Status => models_status(&cli.profile, &out)?,
            ModelCommands::Add { name, all } => {
                models_add(&cli.profile, name.as_deref(), all).await?
            }
            ModelCommands::Remove { name } => models_remove(&cli.profile, &name, &out)?,
        },

        // ── usage ─────────────────────────────────────────────────────────────
        Some(Commands::Usage) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            commands::usage::run(&client, &out).await?;
        }

        // ── logs ──────────────────────────────────────────────────────────────
        Some(Commands::Logs { target, follow }) => {
            let service_names = ["api", "gateway", "realtime", "runtime", "daemon"];
            if service_names.contains(&target.as_str()) {
                commands::service::logs(&target, follow)?;
            } else {
                let (_, client) = commands::require_auth(&cli.profile)?;
                commands::logs::show(&client, target, &out).await?;
            }
        }

        // ── node ──────────────────────────────────────────────────────────────
        Some(Commands::Node { cmd }) => match cmd {
            NodeCommands::Join => {
                commands::node::join::run(&cli.profile, &out).await?;
            }
            NodeCommands::Leave { forget } => {
                commands::node::leave::run(&cli.profile, forget, &out).await?;
            }
            NodeCommands::Status => {
                commands::node::status::run(&cli.profile, &out).await?;
            }
        },

        // ── update ────────────────────────────────────────────────────────────
        Some(Commands::Update) => {
            self_update(&out)?;
        }

        // ── code ──────────────────────────────────────────────────────────────
        Some(Commands::Code) => {
            launch_code_tool()?;
        }

        // ── config ────────────────────────────────────────────────────────────
        Some(Commands::Config { cmd }) => match cmd {
            ConfigCommands::Path => {
                println!("{}", config::path_display(&cli.profile));
            }
            ConfigCommands::Get { key } => {
                let cfg = config::load(&cli.profile)?;
                let val = config_get_value(&cfg, &key);
                println!("{}", val.unwrap_or_else(|| "(not set)".into()));
            }
            ConfigCommands::Set { key, value } => {
                let mut cfg = config::load(&cli.profile)?;
                config_set_value(&mut cfg, &key, &value)?;
                config::save(&cfg, &cli.profile)?;
                out.success(&format!("{key} = {value}"), None::<()>);
            }
        },
    }

    Ok(())
}

// ── models inline handlers ────────────────────────────────────────────────────

fn models_list(profile: &str, _out: &output::Output) -> Result<()> {
    let cfg = config::load(profile)?;
    if cfg.model_providers.is_empty() {
        println!();
        println!("  {} No providers configured.", console::style("→").dim());
        println!(
            "  Run {} to add one.",
            console::style("maschina models add").cyan()
        );
        println!();
        return Ok(());
    }
    println!();
    for p in &cfg.model_providers {
        let has_key = p.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false);
        let key_indicator = if has_key { "●" } else { "○" };
        println!(
            "  {} {:<16} {}",
            console::style(key_indicator).white(),
            console::style(&p.name).bold(),
            p.base_url.as_deref().unwrap_or(""),
        );
    }
    println!();
    Ok(())
}

fn models_status(profile: &str, out: &output::Output) -> Result<()> {
    let cfg = config::load(profile)?;
    println!();
    if cfg.model_providers.is_empty() {
        println!(
            "  {} No providers configured — run `maschina models add`",
            console::style("→").dim()
        );
    } else {
        for p in &cfg.model_providers {
            let configured =
                p.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false) || p.base_url.is_some();
            out.check(&p.name, configured, None);
        }
    }
    println!();
    Ok(())
}

async fn models_add(profile: &str, name: Option<&str>, add_all: bool) -> Result<()> {
    use inquire::{Password, Select, Text};

    static ALL_PROVIDERS: &[&str] = &[
        "anthropic",
        "openai",
        "ollama",
        "openrouter",
        "gemini",
        "mistral",
        "custom",
    ];

    let providers_to_add: Vec<&str> = if add_all {
        ALL_PROVIDERS.to_vec()
    } else if let Some(n) = name {
        if !ALL_PROVIDERS.contains(&n) {
            anyhow::bail!(
                "unknown provider '{}'. Choices: {}",
                n,
                ALL_PROVIDERS.join(", ")
            );
        }
        vec![n]
    } else {
        vec![Select::new("Provider:", ALL_PROVIDERS.to_vec()).prompt()?]
    };

    let mut cfg = config::load(profile)?;
    let mut added: Vec<&str> = vec![];

    for provider in &providers_to_add {
        let (api_key, base_url) = if *provider == "ollama" {
            let url = Text::new("Ollama base URL:")
                .with_default("http://localhost:11434")
                .prompt()?;
            (None, Some(url))
        } else if *provider == "custom" {
            let url = Text::new("Base URL (OpenAI-compatible):").prompt()?;
            let key = Password::new("API key (optional):")
                .without_confirmation()
                .prompt_skippable()?;
            (key, Some(url))
        } else {
            let key = Password::new(&format!("{provider} API key:"))
                .without_confirmation()
                .prompt()?;
            (Some(key), None)
        };

        cfg.model_providers.retain(|p| &p.name != provider);
        cfg.model_providers.push(config::ModelProvider {
            name: provider.to_string(),
            api_key,
            base_url,
        });
        added.push(provider);
    }

    config::save(&cfg, profile)?;
    println!();
    for p in &added {
        println!("  {} {}", console::style("✓").green(), p);
    }
    println!();
    Ok(())
}

fn models_remove(profile: &str, name: &str, out: &output::Output) -> Result<()> {
    let mut cfg = config::load(profile)?;
    let before = cfg.model_providers.len();
    cfg.model_providers.retain(|p| p.name != name);
    if cfg.model_providers.len() == before {
        out.warn(&format!("provider '{name}' not found"));
    } else {
        config::save(&cfg, profile)?;
        out.success(&format!("{name} removed"), None::<()>);
    }
    Ok(())
}

// ── config get / set ──────────────────────────────────────────────────────────

fn config_get_value(cfg: &config::Config, key: &str) -> Option<String> {
    match key {
        "api_url" => Some(cfg.api_url.clone()),
        "email" => cfg.email.clone(),
        "db_url" => cfg.db_url.clone(),
        "profile" => Some(cfg.profile.clone()),
        "api_key" => cfg.api_key.as_ref().map(|_| "(set, hidden)".into()),
        _ => None,
    }
}

fn config_set_value(cfg: &mut config::Config, key: &str, value: &str) -> Result<()> {
    match key {
        "api_url" => cfg.api_url = value.to_string(),
        "db_url" => cfg.db_url = Some(value.to_string()),
        "email" => cfg.email = Some(value.to_string()),
        _ => anyhow::bail!("unknown config key: {key}"),
    }
    Ok(())
}

// ── update ────────────────────────────────────────────────────────────────────

fn self_update(out: &output::Output) -> Result<()> {
    // 1. Node update — if running on a Maschina node, run the update script first.
    //    This pulls latest code, rebuilds changed services, and applies migrations.
    let home = std::env::var("HOME").unwrap_or_default();
    let update_script = std::path::PathBuf::from(&home)
        .join("Desktop")
        .join("maschina")
        .join("scripts")
        .join("update.sh");

    if update_script.exists() {
        out.info("node detected — running update script...");
        let status = Command::new("bash").arg(&update_script).status();

        match status {
            Ok(s) if s.success() => {
                out.success("Node updated successfully", None::<()>);
            }
            _ => {
                out.warn("node update script failed — check `journalctl -u maschina-update@$USER.service`");
            }
        }
        return Ok(());
    }

    // 2. CLI self-update — not on a node, just update the binary.
    out.info("checking for CLI updates...");
    let script_url = "https://raw.githubusercontent.com/RustMunkey/maschina/main/install.sh";
    let status = Command::new("sh")
        .args(["-c", &format!("curl -fsSL {script_url} | sh")])
        .status();

    match status {
        Ok(s) if s.success() => out.success("CLI updated to latest version", None::<()>),
        _ => {
            out.warn("auto-update failed — download manually from:");
            println!("  https://github.com/RustMunkey/maschina/releases");
        }
    }
    Ok(())
}

// ── code tool launcher ────────────────────────────────────────────────────────

fn launch_code_tool() -> Result<()> {
    // 1. Installed release binary
    let installed = services::bin_dir().join("maschina-code");
    if installed.exists() {
        Command::new(&installed).status()?;
        return Ok(());
    }

    // 2. In PATH
    if Command::new("maschina-code").status().is_ok() {
        return Ok(());
    }

    // 3. Not found
    println!();
    println!(
        "  {} maschina code tool not installed",
        console::style("→").dim()
    );
    println!();
    println!(
        "  Install it with: {}",
        console::style("cargo install --git https://github.com/RustMunkey/maschina maschina-code")
            .cyan()
    );
    println!();

    Ok(())
}
