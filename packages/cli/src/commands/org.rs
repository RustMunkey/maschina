use anyhow::Result;
use console::style;

use crate::{client::ApiClient, output::Output};

pub async fn list(client: &ApiClient, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get("/orgs").await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        out.info("no organizations found. run `maschina org create --name <name>`");
        return Ok(());
    }
    println!();
    for org in &arr {
        let id = org["id"].as_str().unwrap_or("");
        let name = org["name"].as_str().unwrap_or("");
        let role = org["role"].as_str().unwrap_or("member");
        println!(
            "  {}  {}  {}",
            style(name).bold(),
            style(role).dim(),
            style(id).dim()
        );
    }
    println!();
    Ok(())
}

pub async fn create(client: &ApiClient, name: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client
        .post("/orgs", &serde_json::json!({ "name": name }))
        .await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let id = data["id"].as_str().unwrap_or("");
    out.success(&format!("organization created: {name} ({id})"), None::<()>);
    Ok(())
}

pub async fn invite(
    client: &ApiClient,
    org_id: String,
    email: String,
    role: String,
    out: &Output,
) -> Result<()> {
    let data: serde_json::Value = client
        .post(
            &format!("/orgs/{org_id}/members"),
            &serde_json::json!({ "email": email, "role": role }),
        )
        .await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    out.success(&format!("invited {email} as {role}"), None::<()>);
    Ok(())
}

pub async fn members(client: &ApiClient, org_id: String, out: &Output) -> Result<()> {
    let data: serde_json::Value = client.get(&format!("/orgs/{org_id}/members")).await?;
    if out.is_json() {
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }
    let arr = data.as_array().cloned().unwrap_or_default();
    if arr.is_empty() {
        out.info("no members found");
        return Ok(());
    }
    println!();
    println!(
        "  {:<32}  {:<12}  {}",
        style("EMAIL").dim(),
        style("ROLE").dim(),
        style("JOINED").dim()
    );
    println!("  {}", style("─".repeat(64)).dim());
    for m in &arr {
        let email = m["email"].as_str().unwrap_or("");
        let role = m["role"].as_str().unwrap_or("");
        let joined = m["createdAt"].as_str().unwrap_or("");
        println!("  {:<32}  {:<12}  {}", email, role, style(joined).dim());
    }
    println!();
    Ok(())
}

pub async fn remove(
    client: &ApiClient,
    org_id: String,
    user_id: String,
    out: &Output,
) -> Result<()> {
    let _: serde_json::Value = client
        .delete(&format!("/orgs/{org_id}/members/{user_id}"))
        .await?;
    out.success(&format!("removed {user_id} from organization"), None::<()>);
    Ok(())
}
