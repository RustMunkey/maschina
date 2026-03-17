use crate::{client::ApiClient, config, output::Output};
use anyhow::Result;
use console::style;

pub async fn run(profile: &str, out: &Output) -> Result<()> {
    let cfg = config::load(profile).unwrap_or_default();
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
        .build()?;

    let mut all_ok = true;

    // ── CLI config ────────────────────────────────────────────────────────────
    out.header("CLI");

    let config_path = config::path_display(profile);
    let config_exists = std::path::Path::new(&config_path).exists();
    check(
        out,
        "Config file",
        config_exists,
        Some(&config_path),
        &mut all_ok,
    );

    let has_auth = cfg.is_authenticated();
    check(
        out,
        "Authenticated",
        has_auth,
        if has_auth {
            None
        } else {
            Some("run `maschina setup`")
        },
        &mut all_ok,
    );

    if has_auth {
        out.kv("  email", cfg.email.as_deref().unwrap_or("unknown"));
        out.kv("  tier", cfg.tier.as_deref().unwrap_or("unknown"));
        out.kv("  api", &cfg.api_url);
    }

    // ── Services ──────────────────────────────────────────────────────────────
    out.header("Services");

    let api_base = cfg.api_url.trim_end_matches('/');

    // API
    let api_ok = health_check(&http, &format!("{api_base}/health")).await;
    check(
        out,
        "API         (port 3000)",
        api_ok,
        Some(api_base),
        &mut all_ok,
    );

    // Gateway
    let gateway_url = api_base.replace(":3000", ":8080").replace("api", "gateway");
    let gateway_ok = health_check(&http, &format!("{gateway_url}/health")).await;
    check(
        out,
        "Gateway     (port 8080)",
        gateway_ok,
        Some(&gateway_url),
        &mut all_ok,
    );

    // Realtime
    let realtime_url = api_base.replace(":3000", ":4000");
    let realtime_ok = health_check(&http, &format!("{realtime_url}/health")).await;
    check(
        out,
        "Realtime    (port 4000)",
        realtime_ok,
        Some(&realtime_url),
        &mut all_ok,
    );

    // Runtime
    let runtime_url = api_base.replace(":3000", ":8001");
    let runtime_ok = health_check(&http, &format!("{runtime_url}/health")).await;
    check(
        out,
        "Runtime     (port 8001)",
        runtime_ok,
        Some(&runtime_url),
        &mut all_ok,
    );

    // ── Auth + account ────────────────────────────────────────────────────────
    if has_auth && api_ok {
        out.header("Account");

        if let Ok(client) = ApiClient::new(&cfg) {
            match client.get::<serde_json::Value>("/users/me").await {
                Ok(me) => {
                    check(out, "Credentials valid", true, None, &mut all_ok);
                    if let Some(tier) = me.get("tier").and_then(|t| t.as_str()) {
                        out.kv("  plan", tier);
                    }
                    if let Some(email) = me.get("email").and_then(|e| e.as_str()) {
                        out.kv("  email", email);
                    }
                }
                Err(_) => {
                    check(
                        out,
                        "Credentials valid",
                        false,
                        Some("token may be expired — run `maschina login`"),
                        &mut all_ok,
                    );
                }
            }

            // Node status
            match client.get::<serde_json::Value>("/nodes/me").await {
                Ok(node) => {
                    let status = node
                        .get("status")
                        .and_then(|s| s.as_str())
                        .unwrap_or("unknown");
                    let is_active = status == "active";
                    out.header("Node");
                    check(out, "Registered", true, None, &mut all_ok);
                    check(
                        out,
                        &format!("Status: {status}"),
                        is_active,
                        None,
                        &mut all_ok,
                    );
                    if let Some(tier) = node.get("tier").and_then(|t| t.as_str()) {
                        out.kv("  tier", tier);
                    }
                    if let Some(earnings) = node.get("totalEarnings").and_then(|e| e.as_str()) {
                        out.kv("  earnings", earnings);
                    }
                }
                Err(_) => {
                    out.header("Node");
                    if !out.is_json() {
                        println!(
                            "  {} Not registered  {}",
                            style("○").dim(),
                            style("run `maschina node join` to participate in the network").dim()
                        );
                    }
                }
            }
        }
    }

    // ── Ollama ────────────────────────────────────────────────────────────────
    out.header("Ollama");

    let ollama_urls = ["http://localhost:11434", "http://172.17.0.1:11434"];

    let mut ollama_found = false;
    for url in &ollama_urls {
        let tags_url = format!("{url}/api/tags");
        if let Ok(resp) = http.get(&tags_url).send().await {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    let models: Vec<&str> = body
                        .get("models")
                        .and_then(|m| m.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|m| m.get("name").and_then(|n| n.as_str()))
                                .collect()
                        })
                        .unwrap_or_default();

                    check(out, &format!("Reachable at {url}"), true, None, &mut all_ok);
                    if models.is_empty() {
                        check(
                            out,
                            "Models loaded",
                            false,
                            Some("run `ollama pull deepseek-r1:1.5b`"),
                            &mut all_ok,
                        );
                    } else {
                        check(
                            out,
                            &format!("Models loaded ({})", models.len()),
                            true,
                            Some(&models.join(", ")),
                            &mut all_ok,
                        );
                    }
                    ollama_found = true;
                    break;
                }
            }
        }
    }

    if !ollama_found {
        if !out.is_json() {
            println!(
                "  {} Not running  {}",
                style("○").dim(),
                style("install at https://ollama.com or set ANTHROPIC_API_KEY").dim()
            );
        }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    println!();
    if all_ok {
        out.success("All checks passed.", None::<()>);
    } else {
        out.warn("Some checks failed — see details above.");
    }

    Ok(())
}

async fn health_check(http: &reqwest::Client, url: &str) -> bool {
    http.get(url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

fn check(out: &Output, label: &str, ok: bool, detail: Option<&str>, all_ok: &mut bool) {
    if !ok {
        *all_ok = false;
    }
    out.check(label, ok, detail);
}
