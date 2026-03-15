use super::require_auth;
use crate::{config, output::Output};
use anyhow::Result;

pub async fn run(profile: &str, out: &Output) -> Result<()> {
    let cfg = config::load(profile)?;

    if out.is_json() {
        if !cfg.is_authenticated() {
            println!("{{\"authenticated\":false}}");
            return Ok(());
        }
        let (_, client) = require_auth(profile)?;
        let health: serde_json::Value = client.get("/health").await.unwrap_or_default();
        let me: serde_json::Value = client.get("/users/me").await.unwrap_or_default();
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "authenticated": true,
                "email": me["email"],
                "plan": me["tier"].as_str().or_else(|| me["plan"].as_str()),
                "api_url": cfg.api_url,
                "api_status": health["status"],
            }))?
        );
        return Ok(());
    }

    out.header("Status");
    out.kv("API URL", &cfg.api_url);

    if !cfg.is_authenticated() {
        out.kv("Auth", "not configured");
        println!();
        out.warn("Run `maschina setup` to get started.");
        return Ok(());
    }

    let (_, client) = require_auth(profile)?;

    let health = client.get::<serde_json::Value>("/health").await;
    match &health {
        Ok(h) => out.kv("API", h["status"].as_str().unwrap_or("ok")),
        Err(_) => out.kv("API", "unreachable"),
    }

    let me = client.get::<serde_json::Value>("/users/me").await;
    if let Ok(ref m) = me {
        if let Some(email) = m["email"].as_str() {
            out.kv("Account", email);
        }
        if let Some(tier) = m["tier"].as_str().or_else(|| m["plan"].as_str()) {
            out.kv("Plan", tier);
        }
        if let Some(role) = m["role"].as_str() {
            out.kv("Role", role);
        }
    }

    if let Some(email) = &cfg.email {
        if me.is_err() {
            out.kv("Account", email);
        }
    }

    if let Some(profile_name) = Some(profile).filter(|p| *p != "default") {
        out.kv("Profile", profile_name);
    }

    println!();
    Ok(())
}
