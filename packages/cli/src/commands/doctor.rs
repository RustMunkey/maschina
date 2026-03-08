use anyhow::Result;
use crate::{client::ApiClient, config, output::Output};

pub async fn run(profile: &str, out: &Output) -> Result<()> {
    out.header("Diagnostics");

    let cfg = config::load(profile).unwrap_or_default();

    // Config file present?
    let config_path = config::path_display(profile);
    let config_exists = std::path::Path::new(&config_path).exists();
    out.check("Config file", config_exists, Some(&config_path));

    // API key configured?
    let has_key = cfg.is_authenticated();
    out.check(
        "API key configured",
        has_key,
        if has_key { None } else { Some("run `maschina setup`") },
    );

    if has_key {
        // API reachable?
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
            .build()?;

        let health = http
            .get(format!("{}/health", cfg.api_url.trim_end_matches('/')))
            .send()
            .await;
        let api_ok = health.map(|r| r.status().is_success()).unwrap_or(false);
        out.check("API reachable", api_ok, Some(&cfg.api_url));

        // Credentials valid?
        if api_ok {
            if let Ok(client) = ApiClient::new(&cfg) {
                let me = client.get::<serde_json::Value>("/users/me").await;
                out.check("Credentials valid", me.is_ok(), None);
            }
        }
    }

    // Project config present?
    let project_config = std::env::current_dir()
        .ok()
        .map(|d| d.join(".maschina").join("config.toml"));
    let project_ok = project_config.as_ref().map(|p| p.exists()).unwrap_or(false);
    out.check(
        "Project config (.maschina/)",
        project_ok,
        if project_ok { None } else { Some("run `maschina setup` in your project dir") },
    );

    println!();

    if !has_key || !config_exists {
        out.warn("Run `maschina setup` to fix configuration issues.");
    } else {
        out.success("Everything looks good.", None::<()>);
    }

    Ok(())
}
