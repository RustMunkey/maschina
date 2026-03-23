use anyhow::Result;
use console::style;

use crate::{client::ApiClient, output::Output};

pub async fn list(client: &ApiClient, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get("/workflows").await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        out.info("no workflows found. run `maschina workflow create` to create one");
        return Ok(());
    }
    println!();
    println!(
        "  {:<36}  {:<24}  {:<14}  {}",
        style("ID").dim(),
        style("NAME").dim(),
        style("TYPE").dim(),
        style("STEPS").dim()
    );
    println!("  {}", style("─".repeat(84)).dim());
    for w in &arr {
        let id = w["id"].as_str().unwrap_or("");
        let name = w["name"].as_str().unwrap_or("");
        let wtype = w["type"].as_str().unwrap_or("");
        let steps = w["steps"].as_array().map(|s| s.len()).unwrap_or(0);
        println!(
            "  {:<36}  {:<24}  {:<14}  {}",
            style(id).dim(),
            name,
            wtype,
            steps
        );
    }
    println!();
    Ok(())
}

pub async fn inspect(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get(&format!("/workflows/{id}")).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    println!();
    println!(
        "  {}  {}",
        style(&data["name"].as_str().unwrap_or("")).bold(),
        style(id.as_str()).dim()
    );
    if let Some(desc) = data["description"].as_str() {
        println!("  {}", style(desc).dim());
    }
    println!("  type: {}", data["type"].as_str().unwrap_or(""));
    println!();
    if let Some(steps) = data["steps"].as_array() {
        println!("  {} steps:", steps.len());
        for (i, step) in steps.iter().enumerate() {
            let name = step["name"].as_str().unwrap_or("");
            let stype = step["type"].as_str().unwrap_or("");
            println!("    {}. {} ({})", i + 1, name, stype);
        }
    }
    if let Some(runs) = data["runs"].as_array() {
        if !runs.is_empty() {
            println!();
            println!("  recent runs:");
            for run in runs.iter().take(5) {
                let status = run["status"].as_str().unwrap_or("");
                let ts = run["createdAt"].as_str().unwrap_or("");
                let dot = match status {
                    "completed" => style("●").green(),
                    "failed" | "cancelled" => style("●").red(),
                    _ => style("●").yellow(),
                };
                println!("    {}  {}  {}", dot, style(status).dim(), style(ts).dim());
            }
        }
    }
    println!();
    Ok(())
}

pub async fn delete(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client.delete(&format!("/workflows/{id}")).await?;
    out.success(&format!("workflow {id} deleted"), None::<()>);
    Ok(())
}

pub async fn trigger(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client
        .post(
            &format!("/workflows/{id}/runs"),
            &serde_json::json!({"input":{}}),
        )
        .await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let run_id = data["id"].as_str().unwrap_or("");
    out.success(&format!("workflow triggered — run {run_id}"), None::<()>);
    Ok(())
}

pub async fn runs(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get(&format!("/workflows/{id}/runs")).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        out.info("no runs found");
        return Ok(());
    }
    println!();
    println!(
        "  {:<36}  {:<12}  {}",
        style("RUN ID").dim(),
        style("STATUS").dim(),
        style("STARTED").dim()
    );
    println!("  {}", style("─".repeat(72)).dim());
    for run in &arr {
        let run_id = run["id"].as_str().unwrap_or("");
        let status = run["status"].as_str().unwrap_or("");
        let ts = run["createdAt"].as_str().unwrap_or("");
        let dot = match status {
            "completed" => style("●").green(),
            "failed" | "cancelled" => style("●").red(),
            _ => style("●").yellow(),
        };
        println!(
            "  {:<36}  {}  {:<12}  {}",
            style(run_id).dim(),
            dot,
            status,
            style(ts).dim()
        );
    }
    println!();
    Ok(())
}
