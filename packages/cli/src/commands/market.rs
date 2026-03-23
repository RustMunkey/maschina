use anyhow::Result;
use console::style;

use crate::{client::ApiClient, output::Output};

pub async fn list(client: &ApiClient, query: Option<String>, out: &Output) -> Result<()> {
    let path = match &query {
        Some(q) => format!("/marketplace?q={}", urlencoding(q)),
        None => "/marketplace".to_string(),
    };
    let data: serde_json::Value = client.get(&path).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        out.info("no listings found");
        return Ok(());
    }
    println!();
    for item in &arr {
        let id = item["id"].as_str().unwrap_or("");
        let name = item["name"].as_str().unwrap_or("unnamed");
        let desc = item["description"].as_str().unwrap_or("");
        let price = item["price"].as_u64().unwrap_or(0);
        let price_str = if price == 0 {
            "free".to_string()
        } else {
            format!("${:.2}", price as f64 / 100.0)
        };
        println!(
            "  {}  {}  {}",
            style(name).bold(),
            style(&price_str).dim(),
            style(id).dim()
        );
        if !desc.is_empty() {
            println!("     {}", style(desc).dim());
        }
    }
    println!();
    Ok(())
}

pub async fn inspect(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get(&format!("/marketplace/{id}")).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    println!();
    let name = data["name"].as_str().unwrap_or("unnamed");
    let desc = data["description"].as_str().unwrap_or("");
    let price = data["price"].as_u64().unwrap_or(0);
    let author = data["author"]["email"].as_str().unwrap_or("unknown");

    println!("  {}", style(name).bold());
    if !desc.is_empty() {
        println!("  {}", style(desc).dim());
    }
    println!();
    println!(
        "  {}  {}",
        style("price").dim(),
        if price == 0 {
            "free".to_string()
        } else {
            format!("${:.2}/run", price as f64 / 100.0)
        }
    );
    println!("  {}  {}", style("author").dim(), style(author).dim());
    println!("  {}  {}", style("id").dim(), style(id).dim());
    println!();
    out.info("install with: maschina market install <id>");
    println!();
    Ok(())
}

pub async fn publish(client: &ApiClient, agent_id: String, price: u64, out: &Output) -> Result<()> {
    let body = serde_json::json!({ "agentId": agent_id, "price": price });
    let data: serde_json::Value = client.post("/marketplace", &body).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let id = data["id"].as_str().unwrap_or("");
    out.success(&format!("published to marketplace: {id}"), None::<()>);
    Ok(())
}

pub async fn unpublish(client: &ApiClient, listing_id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client.delete(&format!("/marketplace/{listing_id}")).await?;
    out.success(&format!("listing {listing_id} removed"), None::<()>);
    Ok(())
}

pub async fn install(client: &ApiClient, listing_id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client
        .post(
            &format!("/marketplace/{listing_id}/install"),
            &serde_json::json!({}),
        )
        .await?;
    out.success("agent installed to your account", None::<()>);
    out.info("view it with: maschina agent list");
    Ok(())
}

fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            '&' => "%26".to_string(),
            '+' => "%2B".to_string(),
            _ => c.to_string(),
        })
        .collect()
}
