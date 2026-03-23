use anyhow::Result;
use console::style;

use crate::{client::ApiClient, output::Output};

pub async fn list(
    client: &ApiClient,
    limit: u32,
    action: Option<String>,
    out: &Output,
) -> Result<()> {
    let mut url = format!("/compliance/audit?limit={limit}");
    if let Some(a) = &action {
        url.push_str(&format!("&action={a}"));
    }
    let data: serde_json::Value = client.get(&url).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data["events"]
        .as_array()
        .or_else(|| data.as_array())
        .cloned()
        .unwrap_or_default();
    if arr.is_empty() {
        out.info("no audit events found");
        return Ok(());
    }
    println!();
    println!(
        "  {:<24}  {:<20}  {:<16}  {}",
        style("TIMESTAMP").dim(),
        style("ACTION").dim(),
        style("RESOURCE").dim(),
        style("IP").dim()
    );
    println!("  {}", style("─".repeat(80)).dim());
    for ev in &arr {
        let ts = ev["createdAt"].as_str().unwrap_or("");
        let action = ev["action"].as_str().unwrap_or("");
        let resource = ev["resourceType"].as_str().unwrap_or("");
        let ip = ev["ipAddress"].as_str().unwrap_or("-");
        println!(
            "  {:<24}  {:<20}  {:<16}  {}",
            style(ts).dim(),
            action,
            resource,
            style(ip).dim()
        );
    }
    println!();
    Ok(())
}

pub async fn export(client: &ApiClient, format: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client
        .post(
            "/compliance/export",
            &serde_json::json!({ "format": format }),
        )
        .await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let url = data["url"].as_str().unwrap_or("");
    out.success("audit log export ready", None::<()>);
    if !url.is_empty() {
        println!("  {}", style(url).bold());
    }
    Ok(())
}
