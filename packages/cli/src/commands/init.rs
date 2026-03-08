use anyhow::Result;
use console::style;
use indicatif::{ProgressBar, ProgressStyle};
use inquire::{Confirm, Password, Select, Text};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::{
    client::ApiClient,
    config::{self, Config},
    project,
};

#[derive(Serialize)]
struct LoginBody {
    email: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    access_token: String,
}

#[derive(Serialize)]
struct CreateKeyBody {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatedKey {
    key: String,
}

pub async fn run() -> Result<()> {
    print_header();

    let existing = config::load().unwrap_or_default();
    let already_configured = existing.api_key.is_some();

    if already_configured {
        println!(
            "  {} Found existing config at {}",
            style("→").dim(),
            style(config::path_display()).dim()
        );
        let reconfigure = Confirm::new("Reconfigure?")
            .with_default(false)
            .prompt()?;
        if !reconfigure {
            println!("\n{} Already configured. Run {} to verify.", style("✓").green(), style("maschina status").cyan());
            return Ok(());
        }
        println!();
    }

    // ─── Step 1: API URL ──────────────────────────────────────────────────────
    println!("{}", style("Step 1/4  —  API endpoint").bold());
    let api_url = Text::new("API URL:")
        .with_default(&existing.api_url)
        .with_help_message("Leave default unless you're running a self-hosted instance")
        .prompt()?;
    println!();

    // ─── Step 2: Authentication ───────────────────────────────────────────────
    println!("{}", style("Step 2/4  —  Authentication").bold());
    let auth_method = Select::new(
        "How would you like to authenticate?",
        vec!["Email and password", "Paste an existing API key"],
    )
    .prompt()?;

    let api_key = if auth_method == "Email and password" {
        login_and_create_key(&api_url).await?
    } else {
        let key = Password::new("API key (starts with msk_):")
            .without_confirmation()
            .with_help_message("Create one at https://app.maschina.dev/keys")
            .prompt()?;
        if !key.starts_with("msk_") {
            println!("{} Key doesn't start with msk_ — double-check it's correct.", style("warning:").yellow());
        }
        key
    };
    println!();

    // ─── Step 3: Validate connection ──────────────────────────────────────────
    println!("{}", style("Step 3/4  —  Validating connection").bold());

    let spin = spinner("Connecting to API...");
    let temp_cfg = Config { api_url: api_url.clone(), api_key: Some(api_key.clone()), email: None };
    let client = ApiClient::new(&temp_cfg)?;

    match client.get::<serde_json::Value>("/health").await {
        Ok(_) => {}
        Err(e) => {
            spin.finish_with_message(format!("{} {}", style("✗").red(), e));
            anyhow::bail!("Could not connect to API. Check your URL and key.");
        }
    }

    let me: serde_json::Value = client.get("/users/me").await.unwrap_or_default();
    let email = me["email"].as_str().unwrap_or("").to_string();
    let tier = me["tier"].as_str().or_else(|| me["plan"].as_str()).unwrap_or("access");

    spin.finish_with_message(format!(
        "{} Connected as {} ({})",
        style("✓").green(),
        style(&email).bold(),
        style(tier).yellow()
    ));

    // Save global config
    let cfg = Config { api_url, api_key: Some(api_key), email: Some(email.clone()) };
    config::save(&cfg)?;
    println!("  Config saved to {}", style(config::path_display()).dim());
    println!();

    // ─── Step 4: Project init (optional) ──────────────────────────────────────
    println!("{}", style("Step 4/4  —  Project setup").bold());

    let cwd = std::env::current_dir()?;
    let cwd_name = cwd.file_name().and_then(|n| n.to_str()).unwrap_or("project");

    // Check if already a maschina project
    let dot_maschina = cwd.join(".maschina");
    if dot_maschina.exists() {
        println!("  {} This directory already has a .maschina config.", style("→").dim());
    } else {
        let init_project = Confirm::new(&format!(
            "Initialize a Maschina project in the current directory ({cwd_name})?",
        ))
        .with_default(true)
        .prompt()?;

        if init_project {
            let project_name = Text::new("Project name:")
                .with_default(cwd_name)
                .prompt()?;

            let description = Text::new("Description (optional):")
                .with_default("")
                .prompt_skippable()?
                .filter(|s| !s.is_empty());

            let project_cfg = project::init_project_config(&project_name, description);
            project::save_project(&dot_maschina, &project_cfg)?;
            println!("  {} Created .maschina/config.toml", style("✓").green());
        }
    }

    // ─── Done ─────────────────────────────────────────────────────────────────
    println!();
    print_success(&email);

    Ok(())
}

async fn login_and_create_key(api_url: &str) -> Result<String> {
    let email = Text::new("Email:").prompt()?;
    let password = Password::new("Password:")
        .without_confirmation()
        .prompt()?;

    let spin = spinner("Authenticating...");

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
        .build()?;

    let resp = http
        .post(format!("{}/auth/login", api_url.trim_end_matches('/')))
        .json(&LoginBody { email, password })
        .send()
        .await?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        let msg = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["message"].as_str().map(String::from))
            .unwrap_or(body);
        spin.finish_with_message(format!("{} {}", style("✗").red(), msg));
        anyhow::bail!("{}", msg);
    }

    let session: LoginResponse = resp.json().await?;
    spin.finish_with_message(format!("{} Authenticated", style("✓").green()));

    // Create a dedicated CLI API key using the session token
    let spin2 = spinner("Creating CLI API key...");
    let temp_cfg = crate::config::Config {
        api_url: api_url.to_string(),
        api_key: Some(session.access_token),
        email: None,
    };
    let client = ApiClient::new(&temp_cfg)?;
    let created: CreatedKey = client.post("/keys", &CreateKeyBody { name: "maschina-cli".to_string() }).await?;
    spin2.finish_with_message(format!("{} CLI key created", style("✓").green()));

    Ok(created.key)
}

fn spinner(msg: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::with_template("  {spinner:.cyan} {msg}")
            .unwrap()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
    );
    pb.set_message(msg.to_string());
    pb.enable_steady_tick(Duration::from_millis(80));
    pb
}

fn print_header() {
    println!();
    println!("  {}", style("Maschina setup").bold().bright());
    println!("  {}", style("Configure your CLI and workspace in 4 steps.").dim());
    println!();
}

fn print_success(email: &str) {
    println!("  ┌────────────────────────────────────────┐");
    println!("  │  {} Setup complete!                  │", style("✓").green().bold());
    println!("  │                                        │");
    println!("  │  Signed in as: {:<24}│", style(email).bold());
    println!("  └────────────────────────────────────────┘");
    println!();
    println!("  What's next:");
    println!("  {}  open the interactive shell", style("maschina").cyan());
    println!("  {}  create your first agent", style("maschina agent deploy <name>").cyan());
    println!("  {}  check quota usage", style("maschina status").cyan());
    println!();
}
