//! Periodic heartbeat loop — keeps the node marked `active` in the API.

use crate::api::{ApiClient, HeartbeatRequest};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Shared mutable count of tasks currently running on this node.
pub type ActiveTaskCounter = Arc<Mutex<u32>>;

pub async fn run(
    api: Arc<ApiClient>,
    node_id: Uuid,
    interval_secs: u64,
    active_tasks: ActiveTaskCounter,
    shutdown: CancellationToken,
) {
    let interval = Duration::from_secs(interval_secs);
    info!(node_id = %node_id, interval_secs, "Heartbeat loop started");

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                info!("Heartbeat loop shutting down.");
                return;
            }
            _ = tokio::time::sleep(interval) => {
                let count = *active_tasks.lock().await;
                let req = HeartbeatRequest {
                    active_task_count: count,
                    health_status: "online".into(),
                    cpu_usage_pct: None,
                    ram_usage_pct: None,
                };
                match api.heartbeat(node_id, &req).await {
                    Ok(()) => info!(node_id = %node_id, active_tasks = count, "Heartbeat sent"),
                    Err(e) => warn!(node_id = %node_id, error = %e, "Heartbeat failed"),
                }
            }
        }
    }
}

/// Send a single heartbeat immediately (used at startup and shutdown).
pub async fn send_once(
    api: &ApiClient,
    node_id: Uuid,
    active_task_count: u32,
    health_status: &str,
) {
    let req = HeartbeatRequest {
        active_task_count,
        health_status: health_status.into(),
        cpu_usage_pct: None,
        ram_usage_pct: None,
    };
    if let Err(e) = api.heartbeat(node_id, &req).await {
        error!(node_id = %node_id, error = %e, "Failed to send startup heartbeat");
    }
}
