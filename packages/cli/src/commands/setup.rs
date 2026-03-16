use anyhow::Result;
use console::style;
use indicatif::{ProgressBar, ProgressStyle};
use inquire::{Confirm, MultiSelect, Password, Select, Text};
use std::time::Duration;

use crate::{
    client::ApiClient,
    config::{self, Config, ModelProvider},
    project, services,
};

// ── wire types ────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct LoginBody {
    email: String,
    password: String,
}
#[derive(serde::Serialize)]
struct RegisterBody {
    email: String,
    password: String,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthResponse {
    access_token: String,
}
#[derive(serde::Serialize)]
struct CreateKeyBody {
    name: String,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatedKey {
    key: String,
}

// ── entry point ───────────────────────────────────────────────────────────────

pub async fn run(profile: &str) -> Result<()> {
    print_header();

    let existing = config::load(profile).unwrap_or_default();

    if existing.is_authenticated() {
        println!(
            "  {} Already configured ({})",
            style("→").dim(),
            style(config::path_display(profile)).dim()
        );
        let reconfigure = Confirm::new("Reconfigure?").with_default(false).prompt()?;
        if !reconfigure {
            println!(
                "\n  {} Already set up. Run {} to verify.\n",
                style("✓").green(),
                style("maschina status").cyan()
            );
            return Ok(());
        }
        println!();
    }

    // ─── Step 1: API URL ──────────────────────────────────────────────────────
    section("1/5  connection");
    let api_url = Text::new("API URL:")
        .with_default(&existing.api_url)
        .with_help_message("Leave default unless you are self-hosting")
        .prompt()?;
    println!();

    // ─── Step 2: Account ──────────────────────────────────────────────────────
    section("2/5  account");
    let auth_choice = Select::new(
        "How would you like to authenticate?",
        vec![
            "Log in to existing account",
            "Create a new account",
            "Paste an API key",
        ],
    )
    .prompt()?;

    let (api_key, email) = match auth_choice {
        "Log in to existing account" => login_flow(&api_url).await?,
        "Create a new account" => register_flow(&api_url).await?,
        _ => paste_key_flow()?,
    };
    println!();

    // ─── Validate ─────────────────────────────────────────────────────────────
    let sp = spinner("Verifying credentials...");
    let tmp = Config {
        api_url: api_url.clone(),
        api_key: Some(api_key.clone()),
        email: email.clone(),
        db_url: None,
        model_providers: vec![],
        node: None,
        profile: profile.to_string(),
    };
    let client = ApiClient::new(&tmp)?;
    let me = client.get::<serde_json::Value>("/users/me").await;

    let (verified_email, tier) = match me {
        Ok(ref v) => (
            v["email"].as_str().unwrap_or("").to_string(),
            v["tier"]
                .as_str()
                .or_else(|| v["plan"].as_str())
                .unwrap_or("access")
                .to_string(),
        ),
        Err(e) => {
            sp.finish_with_message(format!("{} {}", style("✗").red(), e));
            anyhow::bail!("could not verify credentials — check your API URL and key");
        }
    };
    sp.finish_with_message(format!(
        "{} signed in as {}  ({})",
        style("✓").green(),
        style(&verified_email).bold(),
        style(&tier).yellow()
    ));
    println!();

    // ─── Step 3: AI providers ─────────────────────────────────────────────────
    section("3/5  ai providers");
    println!(
        "  {}",
        style("Configure which AI providers Maschina can use.").dim()
    );
    println!();

    let provider_options = vec![
        "Anthropic (Claude)",
        "OpenAI (GPT-4o, o1, o3)",
        "Ollama (local models)",
        "OpenRouter (multi-model gateway)",
        "Google Gemini",
        "Mistral",
        "Skip for now",
    ];

    let selected_providers = MultiSelect::new("Select providers:", provider_options)
        .with_help_message("Space to toggle, Enter to confirm")
        .prompt()?;

    let mut model_providers: Vec<ModelProvider> = vec![];

    for p in &selected_providers {
        match *p {
            "Skip for now" => break,
            "Anthropic (Claude)" => {
                let key = Password::new("Anthropic API key:")
                    .without_confirmation()
                    .with_help_message("sk-ant-...")
                    .prompt()?;
                model_providers.push(ModelProvider {
                    name: "anthropic".into(),
                    api_key: Some(key),
                    base_url: None,
                });
            }
            "OpenAI (GPT-4o, o1, o3)" => {
                let key = Password::new("OpenAI API key:")
                    .without_confirmation()
                    .with_help_message("sk-...")
                    .prompt()?;
                model_providers.push(ModelProvider {
                    name: "openai".into(),
                    api_key: Some(key),
                    base_url: None,
                });
            }
            "Ollama (local models)" => {
                let base = Text::new("Ollama base URL:")
                    .with_default("http://localhost:11434")
                    .prompt()?;
                model_providers.push(ModelProvider {
                    name: "ollama".into(),
                    api_key: None,
                    base_url: Some(base),
                });
            }
            "OpenRouter (multi-model gateway)" => {
                let key = Password::new("OpenRouter API key:")
                    .without_confirmation()
                    .with_help_message("sk-or-...")
                    .prompt()?;
                model_providers.push(ModelProvider {
                    name: "openrouter".into(),
                    api_key: Some(key),
                    base_url: None,
                });
            }
            "Google Gemini" => {
                let key = Password::new("Gemini API key:")
                    .without_confirmation()
                    .prompt()?;
                model_providers.push(ModelProvider {
                    name: "gemini".into(),
                    api_key: Some(key),
                    base_url: None,
                });
            }
            "Mistral" => {
                let key = Password::new("Mistral API key:")
                    .without_confirmation()
                    .prompt()?;
                model_providers.push(ModelProvider {
                    name: "mistral".into(),
                    api_key: Some(key),
                    base_url: None,
                });
            }
            _ => {}
        }
    }
    println!();

    // ─── Step 4: Database ─────────────────────────────────────────────────────
    section("4/5  database");

    let db_choice = Select::new(
        "Which database would you like to use?",
        vec![
            "SQLite  (local, zero setup — recommended for getting started)",
            "PostgreSQL  (self-hosted or Docker)",
            "Neon  (serverless Postgres — recommended for cloud)",
        ],
    )
    .prompt()?;

    let db_url = match db_choice {
        "SQLite  (local, zero setup — recommended for getting started)" => {
            let default_path = dirs::data_local_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("~/.local/share"))
                .join("maschina")
                .join("data.db");
            let path = Text::new("SQLite database path:")
                .with_default(
                    default_path
                        .to_str()
                        .unwrap_or("~/.local/share/maschina/data.db"),
                )
                .prompt()?;
            Some(format!("sqlite:{path}"))
        }
        "PostgreSQL  (self-hosted or Docker)" => {
            let url = Text::new("PostgreSQL connection URL:")
                .with_default("postgresql://maschina:maschina@localhost:5432/maschina")
                .with_help_message("postgresql://user:password@host:port/dbname")
                .prompt()?;
            Some(url)
        }
        "Neon  (serverless Postgres — recommended for cloud)" => {
            let url = Text::new("Neon connection string:")
                .with_help_message(
                    "postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require",
                )
                .prompt()?;
            Some(url)
        }
        _ => None,
    };
    println!();

    // ─── Save config ──────────────────────────────────────────────────────────
    let cfg = Config {
        api_url: api_url.clone(),
        api_key: Some(api_key),
        email: Some(email.unwrap_or_else(|| verified_email.clone())),
        db_url,
        model_providers,
        node: None,
        profile: profile.to_string(),
    };
    config::save(&cfg, profile)?;
    println!(
        "  {} Config saved to {}",
        style("→").dim(),
        style(config::path_display(profile)).dim()
    );
    println!();

    // ─── Step 5: Project init ─────────────────────────────────────────────────
    section("5/5  workspace");

    let cwd = std::env::current_dir()?;
    let dot = cwd.join(".maschina");

    if !dot.exists() {
        let cwd_name = cwd
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("project");
        let init = Confirm::new(&format!("Initialize a Maschina project in ./{cwd_name}?"))
            .with_default(true)
            .prompt()?;

        if init {
            let name = Text::new("Project name:").with_default(cwd_name).prompt()?;
            let desc = Text::new("Description (optional):")
                .prompt_skippable()?
                .filter(|s: &String| !s.is_empty());
            let pcfg = project::init_project_config(&name, desc);
            project::save_project(&dot, &pcfg)?;
            println!("  {} Created .maschina/config.toml", style("✓").green());
        }
    } else {
        println!("  {} .maschina/ already exists", style("→").dim());
    }

    // ─── Check services ───────────────────────────────────────────────────────
    let bin_dir = services::bin_dir();
    let any_installed = services::all()
        .iter()
        .any(|s| bin_dir.join(s.name).exists());
    if !any_installed {
        println!();
        println!(
            "  {} Service binaries not found in {}",
            style("!").yellow(),
            bin_dir.display()
        );
        println!(
            "  {} Run {} to start services in dev mode,",
            style("→").dim(),
            style("maschina service start").cyan()
        );
        println!(
            "  {} or download release binaries from {}",
            style("→").dim(),
            style("github.com/RustMunkey/maschina/releases").cyan()
        );
    }

    // ─── Done ─────────────────────────────────────────────────────────────────
    print_done(&verified_email, &tier);
    Ok(())
}

// ── auth flows ────────────────────────────────────────────────────────────────

async fn login_flow(api_url: &str) -> Result<(String, Option<String>)> {
    let email = Text::new("Email:").prompt()?;
    let password = Password::new("Password:").without_confirmation().prompt()?;

    let sp = spinner("Authenticating...");
    let http = http_client()?;

    let resp = http
        .post(format!("{}/auth/login", api_url.trim_end_matches('/')))
        .json(&LoginBody {
            email: email.clone(),
            password,
        })
        .send()
        .await?;

    if !resp.status().is_success() {
        let msg = extract_error(resp.text().await?);
        sp.finish_with_message(format!("{} {}", style("✗").red(), msg));
        anyhow::bail!("{msg}");
    }

    let session: AuthResponse = resp.json().await?;
    sp.finish_with_message(format!("{} Authenticated", style("✓").green()));

    let key = create_cli_key(api_url, &session.access_token).await?;
    Ok((key, Some(email)))
}

async fn register_flow(api_url: &str) -> Result<(String, Option<String>)> {
    let email = Text::new("Email:").prompt()?;
    let password = Password::new("Password:")
        .with_help_message("min 12 chars, mix of letters, numbers, and symbols")
        .prompt()?;

    let sp = spinner("Creating account...");
    let http = http_client()?;

    let resp = http
        .post(format!("{}/auth/register", api_url.trim_end_matches('/')))
        .json(&RegisterBody {
            email: email.clone(),
            password,
        })
        .send()
        .await?;

    if !resp.status().is_success() {
        let msg = extract_error(resp.text().await?);
        sp.finish_with_message(format!("{} {}", style("✗").red(), msg));
        anyhow::bail!("{msg}");
    }

    let session: AuthResponse = resp.json().await?;
    sp.finish_with_message(format!("{} Account created", style("✓").green()));

    let key = create_cli_key(api_url, &session.access_token).await?;
    Ok((key, Some(email)))
}

fn paste_key_flow() -> Result<(String, Option<String>)> {
    let key = Password::new("API key (msk_...):")
        .without_confirmation()
        .prompt()?;
    if !key.starts_with("msk_") {
        println!(
            "  {} Key doesn't look right — should start with msk_",
            style("!").yellow()
        );
    }
    Ok((key, None))
}

async fn create_cli_key(api_url: &str, access_token: &str) -> Result<String> {
    let sp = spinner("Creating CLI API key...");
    let tmp = Config {
        api_url: api_url.to_string(),
        api_key: Some(access_token.to_string()),
        email: None,
        db_url: None,
        model_providers: vec![],
        node: None,
        profile: "default".into(),
    };
    let client = ApiClient::new(&tmp)?;
    let created: CreatedKey = client
        .post(
            "/keys",
            &CreateKeyBody {
                name: "maschina-cli".into(),
            },
        )
        .await?;
    sp.finish_with_message(format!("{} CLI key created", style("✓").green()));
    Ok(created.key)
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn http_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
        .build()?)
}

fn extract_error(body: String) -> String {
    serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v["message"].as_str().map(String::from))
        .unwrap_or(body)
}

fn spinner(msg: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::with_template("  {spinner:.dim} {msg}")
            .unwrap()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
    );
    pb.set_message(msg.to_string());
    pb.enable_steady_tick(Duration::from_millis(80));
    pb
}

fn section(title: &str) {
    println!("  {}", style(title).bold());
    println!("  {}", style("─".repeat(40)).dim());
}

fn print_header() {
    println!();
    println!("  {}", style("MASCHINA").bold().white());
    println!("  {}", style("setup wizard").dim());
    println!();
}

fn print_done(email: &str, tier: &str) {
    println!();
    println!("  {}", style("─".repeat(48)).dim());
    println!("  {}  setup complete", style("✓").green().bold());
    println!("  {}", style("─".repeat(48)).dim());
    println!();
    println!(
        "  {:<22} {}",
        style("signed in as").dim(),
        style(email).bold()
    );
    println!("  {:<22} {}", style("plan").dim(), style(tier).yellow());
    println!();
    println!("  next steps:");
    println!(
        "  {:<40} start all services",
        style("maschina service start").cyan()
    );
    println!(
        "  {:<40} list your agents",
        style("maschina agent list").cyan()
    );
    println!(
        "  {:<40} deploy a new agent",
        style("maschina agent deploy <name>").cyan()
    );
    println!("  {:<40} see all commands", style("maschina --help").cyan());
    println!();
}
