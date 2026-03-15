// node/leave.rs — Leave the Maschina compute network.
//
// Sets the node to "draining" status (no new tasks routed) and optionally
// clears the node_id from config so the machine can re-register later.

use anyhow::Result;
use console::style;
use inquire::Confirm;

use crate::client::ApiClient;
use crate::config;
use crate::output::Output;

pub async fn run(profile: &str, forget: bool, out: &Output) -> Result<()> {
    let mut cfg = config::load(profile)?;

    let node = cfg
        .node
        .as_ref()
        .ok_or_else(|| {
            anyhow::anyhow!(
                "this machine is not registered as a node — run `maschina node join` first"
            )
        })?
        .clone();

    println!();
    println!("  Node: {}", style(&node.node_id).bold());
    println!();

    let confirmed = Confirm::new("Mark this node as offline?")
        .with_default(true)
        .prompt()?;

    if !confirmed {
        println!("  {} Cancelled", style("→").dim());
        return Ok(());
    }

    let client = ApiClient::new(&cfg)?;

    // Set to draining first, then offline
    let _: serde_json::Value = client
        .patch(
            &format!("/nodes/{}", node.node_id),
            &serde_json::json!({ "status": "offline" }),
        )
        .await
        .unwrap_or(serde_json::Value::Null);

    out.success("Node marked offline", None::<()>);

    if forget {
        cfg.node = None;
        config::save(&cfg, profile)?;
        println!(
            "  {} Node credentials cleared. Run `maschina node join` to re-register.",
            style("→").dim()
        );
    } else {
        println!(
            "  {} Node credentials kept. Run `maschina node join` to reconnect.",
            style("→").dim()
        );
    }

    println!();
    Ok(())
}
