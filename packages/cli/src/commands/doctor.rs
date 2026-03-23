use crate::{client::ApiClient, config, output::Output};
use anyhow::Result;
use console::style;

pub async fn run(profile: &str, fix: bool, out: &Output) -> Result<()> {
    let cfg = config::load(profile).unwrap_or_default();
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
        .build()?;

    let mut issues: Vec<String> = vec![];

    println!();

    // ── CLI config ────────────────────────────────────────────────────────────
    section("Configuration");

    let config_path = config::path_display(profile);
    let config_exists =
        std::path::Path::new(&config::config_path(profile).unwrap_or_default()).exists();
    row("Config file", config_exists, Some(&config_path));

    let has_auth = cfg.is_authenticated();
    row(
        "Authenticated",
        has_auth,
        if has_auth {
            cfg.email.as_deref()
        } else {
            Some("run `maschina setup` or `maschina login`")
        },
    );
    if !has_auth {
        issues.push("not authenticated".into());
    }

    if has_auth {
        let tier = cfg.tier.as_deref().unwrap_or("unknown");
        row("Plan", true, Some(tier));
        row("API endpoint", true, Some(cfg.api_url.as_str()));
    }

    // ── Services ──────────────────────────────────────────────────────────────
    section("Services");

    let api_base = cfg.api_url.trim_end_matches('/');
    let api_ok = health_check(&http, &format!("{api_base}/health")).await;
    row("API          :3000", api_ok, Some(api_base));
    if !api_ok {
        issues.push("API unreachable".into());
    }

    // Gateway — derive from api_url host, use port 8080
    let gateway_base = derive_url(api_base, 8080);
    let gateway_ok = health_check(&http, &format!("{gateway_base}/health")).await;
    row("Gateway      :8080", gateway_ok, Some(&gateway_base));
    if !gateway_ok {
        issues.push("Gateway unreachable".into());
    }

    let realtime_base = derive_url(api_base, 4000);
    let realtime_ok = health_check(&http, &format!("{realtime_base}/health")).await;
    row("Realtime     :4000", realtime_ok, Some(&realtime_base));

    let runtime_base = derive_url(api_base, 8001);
    let runtime_ok = health_check(&http, &format!("{runtime_base}/health")).await;
    row("Runtime      :8001", runtime_ok, Some(&runtime_base));

    // ── Account ───────────────────────────────────────────────────────────────
    if has_auth && api_ok {
        section("Account");

        if let Ok(client) = ApiClient::new(&cfg) {
            match client.get::<serde_json::Value>("/users/me").await {
                Ok(me) => {
                    row("Credentials", true, None);
                    if let Some(email) = me["email"].as_str() {
                        row("Email", true, Some(email));
                    }
                    if let Some(tier) = me["tier"].as_str() {
                        row("Tier", true, Some(tier));
                    }
                }
                Err(_) => {
                    row(
                        "Credentials",
                        false,
                        Some("token expired — run `maschina login`"),
                    );
                    issues.push("credentials invalid".into());
                }
            }

            match client.get::<serde_json::Value>("/nodes/me").await {
                Ok(node) => {
                    section("Node");
                    let status = node["status"].as_str().unwrap_or("unknown");
                    row("Registered", true, None);
                    row(&format!("Status: {status}"), status == "active", None);
                    if let Some(e) = node["totalEarnings"].as_str() {
                        row("Earnings", true, Some(e));
                    }
                }
                Err(_) => {
                    section("Node");
                    println!(
                        "  {} not registered  {}",
                        style("○").dim(),
                        style("run `maschina node join` to participate").dim()
                    );
                }
            }
        }
    }

    // ── Model providers ───────────────────────────────────────────────────────
    section("Model Providers");

    let providers = &cfg.model_providers;
    if providers.is_empty() {
        println!(
            "  {} none configured  {}",
            style("○").dim(),
            style("run `maschina model provider add` to configure").dim()
        );
    } else {
        for p in providers {
            let has_key = p.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false);
            let has_url = p.base_url.as_ref().map(|u| !u.is_empty()).unwrap_or(false);
            let ok = has_key || has_url;
            let detail = p.base_url.as_deref().filter(|_| !has_key);
            row(&p.name, ok, detail);
        }
    }

    // ── Ollama ────────────────────────────────────────────────────────────────
    section("Ollama");

    let ollama_urls = ["http://localhost:11434", "http://172.17.0.1:11434"];
    let mut ollama_found = false;
    for url in &ollama_urls {
        if let Ok(resp) = http.get(&format!("{url}/api/tags")).send().await {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    let models: Vec<&str> = body["models"]
                        .as_array()
                        .map(|arr| arr.iter().filter_map(|m| m["name"].as_str()).collect())
                        .unwrap_or_default();
                    row(&format!("Reachable at {url}"), true, None);
                    if models.is_empty() {
                        row(
                            "Models loaded",
                            false,
                            Some("run `ollama pull deepseek-r1:1.5b`"),
                        );
                        issues.push("no Ollama models loaded".into());
                    } else {
                        row(
                            &format!("Models ({})", models.len()),
                            true,
                            Some(&models.join(", ")),
                        );
                    }
                    ollama_found = true;
                    break;
                }
            }
        }
    }
    if !ollama_found {
        println!(
            "  {} not running  {}",
            style("○").dim(),
            style("install at https://ollama.com or add a provider key").dim()
        );
    }

    // ── Shell completions ─────────────────────────────────────────────────────
    section("Shell");

    let shell = std::env::var("SHELL").unwrap_or_default();
    let shell_name = shell.rsplit('/').next().unwrap_or("unknown");
    row(&format!("Shell: {shell_name}"), true, Some(&shell));

    let completions_installed = check_completions_installed(shell_name);
    let completions_hint = format!("run `maschina completions {shell_name}` to generate");
    row(
        "Completions installed",
        completions_installed,
        if completions_installed {
            None
        } else {
            Some(completions_hint.as_str())
        },
    );

    if !completions_installed && fix {
        offer_completions_install(shell_name);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    println!();
    println!("  {}", style("─".repeat(56)).dim());

    if issues.is_empty() {
        println!("  {} all checks passed", style("✓").green().bold());
    } else {
        println!(
            "  {} {} issue{} found:",
            style("!").yellow().bold(),
            issues.len(),
            if issues.len() == 1 { "" } else { "s" }
        );
        for issue in &issues {
            println!("    {} {}", style("·").dim(), issue);
        }
        if !fix {
            println!();
            println!(
                "  {} run {} to attempt automatic fixes",
                style("→").dim(),
                style("maschina doctor --fix").bold()
            );
        }
    }
    println!();

    Ok(())
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn section(title: &str) {
    let width = 56usize;
    let line = "─".repeat(width.saturating_sub(title.len() + 3));
    println!(
        "\n  {} {}{}",
        style("◆").dim(),
        style(title).bold(),
        style(format!(" {line}")).dim()
    );
}

fn row(label: &str, ok: bool, detail: Option<&str>) {
    let icon = if ok {
        style("✓").green()
    } else {
        style("✗").red()
    };
    let detail_str = detail
        .map(|d| format!("  {}", style(d).dim()))
        .unwrap_or_default();
    println!("  {icon}  {label}{detail_str}");
}

async fn health_check(http: &reqwest::Client, url: &str) -> bool {
    http.get(url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

fn derive_url(api_base: &str, port: u16) -> String {
    // Replace whatever port is in the URL with the given port
    if let Some(idx) = api_base.rfind(':') {
        // Check if what's after the colon looks like a port number
        let after = &api_base[idx + 1..];
        if after.chars().all(|c| c.is_ascii_digit()) {
            return format!("{}:{}", &api_base[..idx], port);
        }
    }
    format!("{api_base}:{port}")
}

fn check_completions_installed(shell: &str) -> bool {
    match shell {
        "zsh" => {
            let home = std::env::var("HOME").unwrap_or_default();
            [
                format!("{home}/.zsh/completions/_maschina"),
                format!("{home}/.local/share/zsh/completions/_maschina"),
                "/usr/local/share/zsh/site-functions/_maschina".into(),
            ]
            .iter()
            .any(|p| std::path::Path::new(p).exists())
        }
        "bash" => [
            "/etc/bash_completion.d/maschina",
            "/usr/local/etc/bash_completion.d/maschina",
        ]
        .iter()
        .any(|p| std::path::Path::new(p).exists()),
        "fish" => {
            let home = std::env::var("HOME").unwrap_or_default();
            std::path::Path::new(&format!("{home}/.config/fish/completions/maschina.fish")).exists()
        }
        _ => false,
    }
}

fn offer_completions_install(shell: &str) {
    match shell {
        "zsh" => {
            let home = std::env::var("HOME").unwrap_or_default();
            let dir = format!("{home}/.zsh/completions");
            let path = format!("{dir}/_maschina");
            if std::fs::create_dir_all(&dir).is_ok() {
                let result = std::process::Command::new("maschina")
                    .args(["completions", "zsh"])
                    .output();
                if let Ok(out) = result {
                    if std::fs::write(&path, &out.stdout).is_ok() {
                        println!("  {} completions installed to {path}", style("✓").green());
                        println!(
                            "  {} add {} to your .zshrc if not already present",
                            style("→").dim(),
                            style("fpath=(~/.zsh/completions $fpath) && autoload -Uz compinit && compinit").bold()
                        );
                        return;
                    }
                }
            }
            println!(
                "  {} could not install completions automatically",
                style("✗").red()
            );
        }
        "fish" => {
            let home = std::env::var("HOME").unwrap_or_default();
            let path = format!("{home}/.config/fish/completions/maschina.fish");
            let result = std::process::Command::new("maschina")
                .args(["completions", "fish"])
                .output();
            if let Ok(out) = result {
                if std::fs::write(&path, &out.stdout).is_ok() {
                    println!("  {} completions installed to {path}", style("✓").green());
                    return;
                }
            }
            println!(
                "  {} could not install completions automatically",
                style("✗").red()
            );
        }
        _ => {
            println!(
                "  {} run {} and add to your shell config",
                style("→").dim(),
                style(format!("maschina completions {shell}")).bold()
            );
        }
    }
}
