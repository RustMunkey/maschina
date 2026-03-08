use anyhow::Result;
use console::style;
use indicatif::{ProgressBar, ProgressStyle};
use inquire::{Password, Text};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::{client::ApiClient, config};

#[derive(Serialize)]
struct LoginBody { email: String, password: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse { access_token: String }

#[derive(Serialize)]
struct CreateKeyBody { name: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatedKey { key: String }

pub async fn run(profile: &str) -> Result<()> {
    let current = config::load(profile).unwrap_or_default();

    let email = Text::new("Email:").prompt()?;
    let password = Password::new("Password:").without_confirmation().prompt()?;

    let spin = spinner("Signing in...");

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
        .build()?;

    let resp = http
        .post(format!("{}/auth/login", current.api_url.trim_end_matches('/')))
        .json(&LoginBody { email: email.clone(), password })
        .send().await?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        let msg = serde_json::from_str::<serde_json::Value>(&body)
            .ok().and_then(|v| v["message"].as_str().map(String::from))
            .unwrap_or(body);
        spin.finish_with_message(format!("{} {}", style("✗").red(), msg));
        anyhow::bail!("{}", msg);
    }

    let session: LoginResponse = resp.json().await?;
    spin.finish_with_message(format!("{} Authenticated", style("✓").green()));

    let spin2 = spinner("Creating CLI API key...");
    let temp = config::Config { api_url: current.api_url.clone(), api_key: Some(session.access_token), email: None, db_url: None, model_providers: vec![], profile: profile.into() };
    let client = ApiClient::new(&temp)?;
    let created: CreatedKey = client.post("/keys", &CreateKeyBody { name: "maschina-cli".into() }).await?;
    spin2.finish_with_message(format!("{} Logged in as {}", style("✓").green(), style(&email).bold()));

    let cfg = config::Config { api_url: current.api_url, api_key: Some(created.key), email: Some(email), db_url: current.db_url, model_providers: current.model_providers, profile: profile.into() };
    config::save(&cfg, profile)?;

    Ok(())
}

fn spinner(msg: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::with_template("  {spinner:.cyan} {msg}").unwrap()
            .tick_strings(&["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]),
    );
    pb.set_message(msg.to_string());
    pb.enable_steady_tick(Duration::from_millis(80));
    pb
}
