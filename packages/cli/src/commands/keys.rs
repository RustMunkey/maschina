use anyhow::Result;
use console::style;
use serde::{Deserialize, Serialize};

use crate::{client::ApiClient, output::Output};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiKey {
    id: String,
    name: String,
    key_prefix: Option<String>,
    is_active: bool,
    created_at: Option<String>,
    last_used_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedKey {
    id: String,
    name: String,
    key: String,
    key_prefix: Option<String>,
}

#[derive(Serialize)]
struct CreateBody {
    name: String,
}

pub async fn list(client: &ApiClient, out: &Output) -> Result<()> {
    let keys: Vec<ApiKey> = client.get("/keys").await?;

    if out.is_json() {
        out.list(&keys);
        return Ok(());
    }

    if keys.is_empty() {
        println!("No API keys. Create one with `maschina keys create <name>`.");
        return Ok(());
    }

    println!(
        "  {:<38} {:<24} {:<22} {}",
        style("ID").dim(),
        style("NAME").dim(),
        style("PREFIX").dim(),
        style("LAST USED").dim()
    );
    for k in &keys {
        println!(
            "  {:<38} {:<24} {:<22} {}",
            style(&k.id).dim(),
            &k.name,
            k.key_prefix.as_deref().unwrap_or("—"),
            k.last_used_at.as_deref().unwrap_or("never"),
        );
    }

    Ok(())
}

pub async fn create(client: &ApiClient, name: String, out: &Output) -> Result<()> {
    let key: CreatedKey = client.post("/keys", &CreateBody { name }).await?;

    if out.is_json() {
        out.data(&key);
        return Ok(());
    }

    println!("{} API key created", style("✓").green().bold());
    println!("  {:<12} {}", style("Name:").dim(), &key.name);
    println!(
        "  {:<12} {}",
        style("Key:").dim(),
        style(&key.key).cyan().bold()
    );
    println!("  {:<12} {}", style("ID:").dim(), style(&key.id).dim());
    println!();
    println!(
        "  {} Copy this key — it will not be shown again.",
        style("!").yellow().bold()
    );

    Ok(())
}

pub async fn revoke(client: &ApiClient, id: String, out: &Output) -> Result<()> {
    let _: serde_json::Value = client.delete(&format!("/keys/{}", id)).await?;
    out.success(&format!("Key {} revoked", style(&id).dim()), None::<()>);
    Ok(())
}
