use anyhow::Result;
use console::style;

use crate::{client::ApiClient, output::Output};

pub async fn list(client: &ApiClient, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get("/webhooks").await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        out.info("no webhooks configured. run `maschina webhook create --url <url>`");
        return Ok(());
    }
    println!();
    for wh in &arr {
        let id = wh["id"].as_str().unwrap_or("");
        let url = wh["url"].as_str().unwrap_or("");
        let enabled = wh["enabled"].as_bool().unwrap_or(false);
        let dot = if enabled {
            style("●").green()
        } else {
            style("○").dim()
        };
        println!("  {}  {}  {}", dot, style(url).bold(), style(id).dim());
        if let Some(events) = wh["events"].as_array() {
            let names: Vec<&str> = events.iter().filter_map(|e| e.as_str()).collect();
            println!("       {}", style(names.join(", ")).dim());
        }
    }
    println!();
    Ok(())
}

pub async fn create(
    client: &ApiClient,
    url: String,
    events: Vec<String>,
    out: &Output,
) -> Result<()> {
    let body = serde_json::json!({ "url": url, "events": events });
    let data: serde_json::Value = client.post("/webhooks", &body).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let id = data["id"].as_str().unwrap_or("");
    let secret = data["secret"].as_str().unwrap_or("");
    out.success(&format!("webhook created: {id}"), None::<()>);
    if !secret.is_empty() {
        println!();
        println!(
            "  {} signing secret (save this — shown once):",
            style("→").dim()
        );
        println!("  {}", style(secret).bold());
        println!();
    }
    Ok(())
}

pub async fn delete(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client.delete(&format!("/webhooks/{id}")).await?;
    out.success(&format!("webhook {id} deleted"), None::<()>);
    Ok(())
}

pub async fn test(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client
        .post(&format!("/webhooks/{id}/test"), &serde_json::json!({}))
        .await?;
    out.success("test event sent", None::<()>);
    Ok(())
}

pub async fn deliveries(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get(&format!("/webhooks/{id}/deliveries")).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        out.info("no deliveries found");
        return Ok(());
    }
    println!();
    println!(
        "  {:<8}  {:<8}  {:<20}  {}",
        style("STATUS").dim(),
        style("CODE").dim(),
        style("EVENT").dim(),
        style("TIMESTAMP").dim()
    );
    println!("  {}", style("─".repeat(64)).dim());
    for d in &arr {
        let ok = d["success"].as_bool().unwrap_or(false);
        let code = d["responseCode"].as_u64().unwrap_or(0);
        let event = d["event"].as_str().unwrap_or("");
        let ts = d["createdAt"].as_str().unwrap_or("");
        let status_s = if ok {
            style("ok").green()
        } else {
            style("fail").red()
        };
        println!(
            "  {:<8}  {:<8}  {:<20}  {}",
            status_s,
            code,
            event,
            style(ts).dim()
        );
    }
    println!();
    Ok(())
}
