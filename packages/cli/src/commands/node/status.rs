// node/status.rs — Show this machine's node status, reputation, and earnings.

use anyhow::Result;
use console::style;

use crate::client::ApiClient;
use crate::config;
use crate::output::Output;

#[derive(serde::Deserialize, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct NodeInfo {
    id: String,
    name: String,
    status: String,
    reputation_score: Option<f64>,
    staked_usdc: Option<String>,
    total_tasks_completed: Option<i64>,
    total_tasks_failed: Option<i64>,
    last_heartbeat_at: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct EarningsSummary {
    total_earned_usdc: Option<String>,
    total_runs: Option<i64>,
}

pub async fn run(profile: &str, out: &Output) -> Result<()> {
    let cfg = config::load(profile)?;

    let node = cfg.node.as_ref().ok_or_else(|| {
        anyhow::anyhow!("this machine is not registered as a node — run `maschina node join` first")
    })?;

    let client = ApiClient::new(&cfg)?;

    let info: NodeInfo = client.get(&format!("/nodes/{}", node.node_id)).await?;
    let earnings: EarningsSummary = client
        .get(&format!("/nodes/{}/earnings", node.node_id))
        .await
        .unwrap_or(EarningsSummary {
            total_earned_usdc: None,
            total_runs: None,
        });

    if out.is_json() {
        out.success("node status", Some(&info));
        return Ok(());
    }

    println!();

    let status_color = match info.status.as_str() {
        "active" => style(&info.status).green(),
        "draining" => style(&info.status).yellow(),
        "offline" | "suspended" => style(&info.status).red(),
        _ => style(&info.status).dim(),
    };

    println!("  {} ({})", style(&info.name).bold(), info.id);
    println!("  Status:     {status_color}");
    println!(
        "  Reputation: {:.1}/100",
        info.reputation_score.unwrap_or(50.0)
    );
    println!(
        "  Staked:     ${} USDC",
        info.staked_usdc.as_deref().unwrap_or("0")
    );
    println!();
    println!(
        "  Tasks completed: {}",
        info.total_tasks_completed.unwrap_or(0)
    );
    println!(
        "  Tasks failed:    {}",
        info.total_tasks_failed.unwrap_or(0)
    );
    println!();
    println!(
        "  Total earned:    ${} USDC",
        earnings.total_earned_usdc.as_deref().unwrap_or("0.00")
    );
    println!("  Earning runs:    {}", earnings.total_runs.unwrap_or(0));

    if let Some(hb) = &info.last_heartbeat_at {
        println!("  Last heartbeat:  {hb}");
    }

    println!();
    Ok(())
}
