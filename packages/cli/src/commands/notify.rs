use anyhow::Result;
use console::style;

use crate::{client::ApiClient, output::Output};

pub async fn list(client: &ApiClient, limit: u32, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get(&format!("/notifications?limit={limit}")).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data["notifications"]
        .as_array()
        .or_else(|| data.as_array())
        .cloned()
        .unwrap_or_default();
    if arr.is_empty() {
        out.info("no notifications");
        return Ok(());
    }
    println!();
    for n in &arr {
        let read = n["read"].as_bool().unwrap_or(false);
        let dot = if read {
            style("○").dim()
        } else {
            style("●").cyan()
        };
        let title = n["title"].as_str().unwrap_or("");
        let body = n["body"].as_str().unwrap_or("");
        let ts = n["createdAt"].as_str().unwrap_or("");
        println!("  {}  {}", dot, style(title).bold());
        if !body.is_empty() {
            println!("     {}", style(body).dim());
        }
        println!("     {}", style(ts).dim());
        println!();
    }
    Ok(())
}

pub async fn read_all(client: &ApiClient, out: &Output) -> Result<()> {
    let _: serde_json::Value = client
        .post("/notifications/read-all", &serde_json::json!({}))
        .await?;
    out.success("all notifications marked as read", None::<()>);
    Ok(())
}

pub async fn clear(client: &ApiClient, out: &Output) -> Result<()> {
    let _: serde_json::Value = client.delete("/notifications").await?;
    out.success("notifications cleared", None::<()>);
    Ok(())
}
