use anyhow::Result;
use console::style;

use crate::{client::ApiClient, output::Output};

pub async fn list(client: &ApiClient, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get("/connectors").await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        out.info("no connectors configured. run `maschina connector add <provider>`");
        return Ok(());
    }
    println!();
    for c in &arr {
        let id = c["id"].as_str().unwrap_or("");
        let provider = c["provider"].as_str().unwrap_or("");
        let name = c["name"].as_str().unwrap_or(provider);
        let ok = c["healthy"].as_bool().unwrap_or(true);
        let dot = if ok {
            style("●").green()
        } else {
            style("●").red()
        };
        println!(
            "  {}  {:<16}  {}  {}",
            dot,
            style(name).bold(),
            style(provider).dim(),
            style(id).dim()
        );
    }
    println!();
    Ok(())
}

pub async fn add(client: &ApiClient, provider: String, out: &Output) -> Result<()> {
    let valid = ["slack", "github", "notion", "linear"];
    if !valid.contains(&provider.as_str()) {
        anyhow::bail!(
            "unknown provider '{}'. choices: {}",
            provider,
            valid.join(", ")
        );
    }

    // Get the OAuth URL from the API
    let data: serde_json::Value = client
        .post(
            &format!("/connectors/{provider}/auth"),
            &serde_json::json!({}),
        )
        .await?;

    let url = data["url"].as_str().unwrap_or("");

    if url.is_empty() {
        anyhow::bail!("could not get OAuth URL for {provider}");
    }

    println!();
    println!(
        "  {} open this URL to connect {}:",
        style("◇").dim(),
        style(&provider).bold()
    );
    println!("  {}", style(url).underlined());
    println!();

    // best-effort browser open
    let _ = std::process::Command::new(if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    })
    .arg(url)
    .spawn();

    out.info("waiting for OAuth callback... (Ctrl+C to cancel)");

    // Poll for completion
    for _ in 0..60 {
        std::thread::sleep(std::time::Duration::from_secs(2));
        match client
            .get::<serde_json::Value>(&format!("/connectors/{provider}/status"))
            .await
        {
            Ok(v) if v["connected"].as_bool().unwrap_or(false) => {
                out.success(&format!("{provider} connected"), None::<()>);
                return Ok(());
            }
            _ => {}
        }
    }

    out.warn("timed out waiting for OAuth. run `maschina connector list` to check status.");
    Ok(())
}

pub async fn remove(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client.delete(&format!("/connectors/{id}")).await?;
    out.success(&format!("connector {id} removed"), None::<()>);
    Ok(())
}

pub async fn test(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client
        .post(&format!("/connectors/{id}/test"), &serde_json::json!({}))
        .await?;
    let ok = data["ok"].as_bool().unwrap_or(false);
    if ok {
        out.success("connector healthy", None::<()>);
    } else {
        let msg = data["message"].as_str().unwrap_or("unknown error");
        out.warn(&format!("connector unhealthy: {msg}"));
    }
    Ok(())
}
