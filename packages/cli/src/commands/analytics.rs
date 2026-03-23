use anyhow::Result;
use console::style;

use crate::{client::ApiClient, output::Output};

pub async fn overview(client: &ApiClient, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get("/analytics/overview").await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    println!();
    let fields = [
        ("total runs", "totalRuns"),
        ("completed", "completedRuns"),
        ("failed", "failedRuns"),
        ("avg duration", "avgDurationMs"),
        ("total tokens", "totalTokens"),
    ];
    for (label, key) in &fields {
        let val = &data[key];
        let display = if val.is_null() {
            "-".to_string()
        } else if let Some(n) = val.as_u64() {
            n.to_string()
        } else if let Some(f) = val.as_f64() {
            format!("{f:.0}")
        } else {
            val.to_string()
        };
        println!("  {:<18}  {}", style(label).dim(), style(&display).bold());
    }
    println!();
    Ok(())
}

pub async fn agents(client: &ApiClient, limit: u32, out: &Output) -> Result<()> {
    let data: serde_json::Value = client
        .get(&format!("/analytics/agents?limit={limit}"))
        .await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data["agents"]
        .as_array()
        .or_else(|| data.as_array())
        .cloned()
        .unwrap_or_default();
    if arr.is_empty() {
        out.info("no agent analytics available yet");
        return Ok(());
    }
    println!();
    println!(
        "  {:<24}  {:<10}  {:<10}  {}",
        style("AGENT").dim(),
        style("RUNS").dim(),
        style("FAILED").dim(),
        style("AVG MS").dim()
    );
    println!("  {}", style("─".repeat(64)).dim());
    for a in &arr {
        let name = a["name"].as_str().unwrap_or("");
        let runs = a["runs"].as_u64().unwrap_or(0);
        let failed = a["failed"].as_u64().unwrap_or(0);
        let avg = a["avgDurationMs"].as_f64().unwrap_or(0.0);
        println!("  {:<24}  {:<10}  {:<10}  {:.0}", name, runs, failed, avg);
    }
    println!();
    Ok(())
}
