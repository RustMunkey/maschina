mod client;
mod commands;
mod config;
mod hardware;
mod output;
mod project;
mod services;
mod theme;
mod tui;

use anyhow::Result;
use clap::{Parser, Subcommand};

// ── CLI definition ────────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(
    name = "maschina",
    about = "The Maschina CLI — infrastructure for autonomous digital labor.\nRun with no arguments to open the dashboard.",
    long_about = None,
    version = concat!("v", env!("CARGO_PKG_VERSION"), " (", env!("MASCHINA_GIT_SHA"), ")"),
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

    /// Scaffold a new local agent project (creates maschina.toml, agent stub, .env.example)
    Init {
        /// Project / directory name (defaults to current directory)
        name: Option<String>,
    },

    /// Authenticate with email and password
    Login,

    /// Clear stored credentials
    Logout,

    /// Show connection status and account info
    Status,

    /// Check configuration, connectivity, and dependencies
    Doctor {
        /// Automatically apply fixes where possible
        #[arg(long)]
        fix: bool,
    },

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

    /// Manage push notifications
    Push {
        #[command(subcommand)]
        cmd: PushCommands,
    },

    /// Interactive agent REPL — run agents across the network
    Code,

    /// Manage outbound webhooks
    Webhook {
        #[command(subcommand)]
        cmd: WebhookCommands,
    },

    /// Browse and publish agents on the marketplace
    Market {
        #[command(subcommand)]
        cmd: MarketCommands,
    },

    /// Manage integrations (Slack, GitHub, Notion, Linear)
    Connector {
        #[command(subcommand)]
        cmd: ConnectorCommands,
    },

    /// Manage multi-step agent workflows
    Workflow {
        #[command(subcommand)]
        cmd: WorkflowCommands,
    },

    /// Manage organizations and team members
    Org {
        #[command(subcommand)]
        cmd: OrgCommands,
    },

    /// View and manage notifications
    Notify {
        #[command(subcommand)]
        cmd: NotifyCommands,
    },

    /// View audit logs and compliance exports
    Audit {
        #[command(subcommand)]
        cmd: AuditCommands,
    },

    /// View usage analytics
    Analytics {
        #[command(subcommand)]
        cmd: AnalyticsCommands,
    },

    /// Generate shell completions
    Completions {
        /// Shell to generate completions for
        #[arg(value_enum)]
        shell: clap_complete::Shell,
    },

    /// Self-update the CLI
    Update,

    /// Manage per-project configuration
    Config {
        #[command(subcommand)]
        cmd: ConfigCommands,
    },
}

// ── service ───────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum ServiceCommands {
    Start {
        name: Option<String>,
    },
    Stop {
        name: Option<String>,
    },
    Restart {
        name: Option<String>,
    },
    Status,
    Logs {
        name: String,
        #[arg(short, long)]
        follow: bool,
    },
}

// ── agent ─────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum AgentCommands {
    List,
    Deploy {
        name: String,
    },
    Stop {
        id: String,
    },
    Run {
        id: String,
        #[arg(short, long, default_value = "{}")]
        input: String,
        /// Queue the run and return immediately without waiting for completion
        #[arg(long)]
        no_wait: bool,
    },
    Runs {
        id: String,
    },
    Inspect {
        id: String,
    },
    Logs {
        id: String,
    },
}

// ── keys ──────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum KeyCommands {
    List,
    Create { name: String },
    Rotate { id: String },
    Revoke { id: String },
}

// ── models ────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum ModelCommands {
    List,
    Status,
    Add {
        name: Option<String>,
        #[arg(long)]
        all: bool,
    },
    Remove {
        name: String,
    },
}

// ── node ──────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum NodeCommands {
    Join,
    Leave {
        #[arg(long)]
        forget: bool,
    },
    Status,
}

// ── push ──────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum PushCommands {
    Subscribe,
    Test,
    Tokens,
}

// ── webhook ───────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum WebhookCommands {
    /// List all configured webhooks
    List,
    /// Create a new webhook endpoint
    Create {
        /// Endpoint URL
        #[arg(long)]
        url: String,
        /// Events to subscribe to (comma-separated, e.g. run.completed,run.failed)
        #[arg(
            long,
            value_delimiter = ',',
            default_value = "run.completed,run.failed"
        )]
        events: Vec<String>,
    },
    /// Delete a webhook
    Delete {
        /// Webhook ID
        id: String,
    },
    /// Send a test event to a webhook
    Test {
        /// Webhook ID
        id: String,
    },
    /// Show delivery history for a webhook
    Deliveries {
        /// Webhook ID
        id: String,
    },
}

// ── market ────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum MarketCommands {
    /// Browse marketplace listings
    List {
        /// Search query
        #[arg(short, long)]
        query: Option<String>,
    },
    /// Show details for a listing
    Inspect {
        /// Listing ID
        id: String,
    },
    /// Publish an agent to the marketplace
    Publish {
        /// Agent ID to publish
        agent_id: String,
        /// Price in cents (0 = free)
        #[arg(long, default_value = "0")]
        price: u64,
    },
    /// Remove a listing from the marketplace
    Unpublish {
        /// Listing ID
        id: String,
    },
    /// Install a marketplace agent to your account
    Install {
        /// Listing ID
        id: String,
    },
}

// ── connector ─────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum ConnectorCommands {
    /// List connected integrations
    List,
    /// Connect a new integration via OAuth
    Add {
        /// Provider name (slack, github, notion, linear)
        provider: String,
    },
    /// Remove an integration
    Remove {
        /// Connector ID
        id: String,
    },
    /// Test connector health
    Test {
        /// Connector ID
        id: String,
    },
}

// ── workflow ──────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum WorkflowCommands {
    /// List all workflows
    List,
    /// Show workflow details and recent runs
    Inspect { id: String },
    /// Trigger a workflow run
    Trigger { id: String },
    /// List runs for a workflow
    Runs { id: String },
    /// Delete a workflow
    Delete { id: String },
}

// ── org ───────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum OrgCommands {
    /// List organizations you belong to
    List,
    /// Create a new organization
    Create { name: String },
    /// List members of an organization
    Members { org_id: String },
    /// Invite a user to an organization
    Invite {
        org_id: String,
        email: String,
        #[arg(default_value = "member")]
        role: String,
    },
    /// Remove a member from an organization
    Remove { org_id: String, user_id: String },
}

// ── notify ────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum NotifyCommands {
    /// List recent notifications
    List {
        #[arg(short, long, default_value = "20")]
        limit: u32,
    },
    /// Mark all notifications as read
    ReadAll,
    /// Clear all notifications
    Clear,
}

// ── audit ─────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum AuditCommands {
    /// List audit log events
    List {
        #[arg(short, long, default_value = "50")]
        limit: u32,
        /// Filter by action type
        #[arg(short, long)]
        action: Option<String>,
    },
    /// Export audit log
    Export {
        #[arg(short, long, default_value = "json")]
        format: String,
    },
}

// ── analytics ─────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum AnalyticsCommands {
    /// Show usage overview
    Overview,
    /// Show per-agent analytics
    Agents {
        #[arg(short, long, default_value = "10")]
        limit: u32,
    },
}

// ── config ────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum ConfigCommands {
    Path,
    Get { key: String },
    Set { key: String, value: String },
}

// ── entry point ───────────────────────────────────────────────────────────────

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
        // ── no args → TUI dashboard ───────────────────────────────────────────
        None => loop {
            match tui::run(&cli.profile)? {
                None => break,
                Some(tui::LaunchTarget::Setup) => {
                    commands::setup::run(&cli.profile).await?;
                }
                Some(tui::LaunchTarget::Code) => {
                    commands::code::run(&cli.profile).await?;
                    break;
                }
            }
        },

        // ── setup ─────────────────────────────────────────────────────────────
        Some(Commands::Setup) => {
            commands::setup::run(&cli.profile).await?;
        }

        // ── init ───────────────────────────────────────────────────────────────
        Some(Commands::Init { name }) => {
            commands::init::run(name, &cli.profile, &out).await?;
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

        Some(Commands::Doctor { fix }) => {
            commands::doctor::run(&cli.profile, fix, &out).await?;
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
                AgentCommands::List => commands::agent::list(&client, &out).await?,
                AgentCommands::Deploy { name } => {
                    commands::agent::deploy(&client, name, &out).await?
                }
                AgentCommands::Stop { id } => commands::agent::stop(&client, id, &out).await?,
                AgentCommands::Run { id, input, no_wait } => {
                    let payload: serde_json::Value = serde_json::from_str(&input)
                        .map_err(|_| anyhow::anyhow!("--input must be valid JSON"))?;
                    commands::agent::run_agent(&client, id, payload, no_wait, &out).await?;
                }
                AgentCommands::Runs { id } => commands::agent::runs(&client, id, &out).await?,
                AgentCommands::Inspect { id } => {
                    commands::agent::inspect(&client, id, &out).await?
                }
                AgentCommands::Logs { id } => commands::logs::show(&client, id, &out).await?,
            }
        }

        // ── keys ──────────────────────────────────────────────────────────────
        Some(Commands::Keys { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                KeyCommands::List => commands::keys::list(&client, &out).await?,
                KeyCommands::Create { name } => commands::keys::create(&client, name, &out).await?,
                KeyCommands::Rotate { id } => commands::keys::rotate(&client, id, &out).await?,
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
            NodeCommands::Join => commands::node::join::run(&cli.profile, &out).await?,
            NodeCommands::Leave { forget } => {
                commands::node::leave::run(&cli.profile, forget, &out).await?
            }
            NodeCommands::Status => commands::node::status::run(&cli.profile, &out).await?,
        },

        // ── push ──────────────────────────────────────────────────────────────
        Some(Commands::Push { cmd }) => {
            let (cfg, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                PushCommands::Subscribe => {
                    let url = format!("{}/notifications/subscribe", cfg.api_url);
                    println!();
                    println!("  Open this URL in your browser to enable Web Push notifications:");
                    println!("  {}", console::style(&url).cyan());
                    println!();
                    let _ = std::process::Command::new(if cfg!(target_os = "macos") {
                        "open"
                    } else {
                        "xdg-open"
                    })
                    .arg(&url)
                    .spawn();
                }
                PushCommands::Test => {
                    let _: serde_json::Value = client
                        .post("/notifications/test", &serde_json::json!({}))
                        .await?;
                    out.success("Test notification sent", None::<()>);
                    out.info("Check your devices — you should receive a push and an in-app notification.");
                }
                PushCommands::Tokens => {
                    let tokens: serde_json::Value = client.get("/notifications/tokens").await?;
                    if out.is_json() {
                        println!("{}", serde_json::to_string_pretty(&tokens)?);
                    } else {
                        let arr = tokens.as_array().cloned().unwrap_or_default();
                        if arr.is_empty() {
                            out.warn("No push tokens registered. Run `maschina push subscribe` to add one.");
                        } else {
                            println!();
                            for t in &arr {
                                println!(
                                    "  {} {}  {}",
                                    console::style(t["id"].as_str().unwrap_or("")).dim(),
                                    console::style(t["platform"].as_str().unwrap_or("")).bold(),
                                    t["deviceName"].as_str().unwrap_or(""),
                                );
                            }
                            println!();
                        }
                    }
                }
            }
        }

        // ── code (REPL) ───────────────────────────────────────────────────────
        Some(Commands::Code) => {
            commands::code::run(&cli.profile).await?;
        }

        // ── webhook ───────────────────────────────────────────────────────────
        Some(Commands::Webhook { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                WebhookCommands::List => commands::webhook::list(&client, &out).await?,
                WebhookCommands::Create { url, events } => {
                    commands::webhook::create(&client, url, events, &out).await?
                }
                WebhookCommands::Delete { id } => {
                    commands::webhook::delete(&client, id, &out).await?
                }
                WebhookCommands::Test { id } => commands::webhook::test(&client, id, &out).await?,
                WebhookCommands::Deliveries { id } => {
                    commands::webhook::deliveries(&client, id, &out).await?
                }
            }
        }

        // ── market ────────────────────────────────────────────────────────────
        Some(Commands::Market { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                MarketCommands::List { query } => {
                    commands::market::list(&client, query, &out).await?
                }
                MarketCommands::Inspect { id } => {
                    commands::market::inspect(&client, id, &out).await?
                }
                MarketCommands::Publish { agent_id, price } => {
                    commands::market::publish(&client, agent_id, price, &out).await?
                }
                MarketCommands::Unpublish { id } => {
                    commands::market::unpublish(&client, id, &out).await?
                }
                MarketCommands::Install { id } => {
                    commands::market::install(&client, id, &out).await?
                }
            }
        }

        // ── connector ─────────────────────────────────────────────────────────
        Some(Commands::Connector { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                ConnectorCommands::List => commands::connector::list(&client, &out).await?,
                ConnectorCommands::Add { provider } => {
                    commands::connector::add(&client, provider, &out).await?
                }
                ConnectorCommands::Remove { id } => {
                    commands::connector::remove(&client, id, &out).await?
                }
                ConnectorCommands::Test { id } => {
                    commands::connector::test(&client, id, &out).await?
                }
            }
        }

        // ── workflow ──────────────────────────────────────────────────────────
        Some(Commands::Workflow { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                WorkflowCommands::List => commands::workflow::list(&client, &out).await?,
                WorkflowCommands::Inspect { id } => {
                    commands::workflow::inspect(&client, id, &out).await?
                }
                WorkflowCommands::Trigger { id } => {
                    commands::workflow::trigger(&client, id, &out).await?
                }
                WorkflowCommands::Runs { id } => {
                    commands::workflow::runs(&client, id, &out).await?
                }
                WorkflowCommands::Delete { id } => {
                    commands::workflow::delete(&client, id, &out).await?
                }
            }
        }

        // ── org ───────────────────────────────────────────────────────────────
        Some(Commands::Org { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                OrgCommands::List => commands::org::list(&client, &out).await?,
                OrgCommands::Create { name } => commands::org::create(&client, name, &out).await?,
                OrgCommands::Members { org_id } => {
                    commands::org::members(&client, org_id, &out).await?
                }
                OrgCommands::Invite {
                    org_id,
                    email,
                    role,
                } => commands::org::invite(&client, org_id, email, role, &out).await?,
                OrgCommands::Remove { org_id, user_id } => {
                    commands::org::remove(&client, org_id, user_id, &out).await?
                }
            }
        }

        // ── notify ────────────────────────────────────────────────────────────
        Some(Commands::Notify { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                NotifyCommands::List { limit } => {
                    commands::notify::list(&client, limit, &out).await?
                }
                NotifyCommands::ReadAll => commands::notify::read_all(&client, &out).await?,
                NotifyCommands::Clear => commands::notify::clear(&client, &out).await?,
            }
        }

        // ── audit ─────────────────────────────────────────────────────────────
        Some(Commands::Audit { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                AuditCommands::List { limit, action } => {
                    commands::audit::list(&client, limit, action, &out).await?
                }
                AuditCommands::Export { format } => {
                    commands::audit::export(&client, format, &out).await?
                }
            }
        }

        // ── analytics ─────────────────────────────────────────────────────────
        Some(Commands::Analytics { cmd }) => {
            let (_, client) = commands::require_auth(&cli.profile)?;
            match cmd {
                AnalyticsCommands::Overview => commands::analytics::overview(&client, &out).await?,
                AnalyticsCommands::Agents { limit } => {
                    commands::analytics::agents(&client, limit, &out).await?
                }
            }
        }

        // ── completions ───────────────────────────────────────────────────────
        Some(Commands::Completions { shell }) => {
            use clap::CommandFactory;
            clap_complete::generate(
                shell,
                &mut Cli::command(),
                "maschina",
                &mut std::io::stdout(),
            );
        }

        // ── update ────────────────────────────────────────────────────────────
        Some(Commands::Update) => {
            self_update(&out)?;
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
            console::style("maschina model add").cyan()
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
            "  {} No providers configured — run `maschina model add`",
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
                "unknown provider '{}'. choices: {}",
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

// ── self update ───────────────────────────────────────────────────────────────

fn self_update(out: &output::Output) -> Result<()> {
    let home = std::env::var("HOME").unwrap_or_default();
    let update_script = std::path::PathBuf::from(&home)
        .join("Desktop")
        .join("maschina")
        .join("scripts")
        .join("update.sh");

    if update_script.exists() {
        out.info("node detected — running update script...");
        let status = std::process::Command::new("bash")
            .arg(&update_script)
            .status();
        match status {
            Ok(s) if s.success() => out.success("Node updated successfully", None::<()>),
            _ => out.warn("node update script failed"),
        }
        return Ok(());
    }

    out.info("checking for CLI updates...");
    let script_url =
        "https://raw.githubusercontent.com/RustMunkey/maschina/main/scripts/install.sh";
    let status = std::process::Command::new("sh")
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
