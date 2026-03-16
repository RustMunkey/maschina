//! Periodic heartbeat loop — keeps the node marked `active` in the API.

use crate::api::{ApiClient, HeartbeatRequest};
use std::sync::Arc;
use std::time::Duration;
use sysinfo::System;
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

    let mut sys = System::new_all();

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                info!("Heartbeat loop shutting down.");
                return;
            }
            _ = tokio::time::sleep(interval) => {
                sys.refresh_all();
                let cpu = sys.global_cpu_usage();
                let total_ram = sys.total_memory();
                let used_ram  = sys.used_memory();
                let ram_pct   = if total_ram > 0 {
                    (used_ram as f32 / total_ram as f32) * 100.0
                } else { 0.0 };

                let count = *active_tasks.lock().await;
                let req = HeartbeatRequest {
                    active_task_count: count,
                    health_status: "online".into(),
                    cpu_usage_pct: Some(cpu),
                    ram_usage_pct: Some(ram_pct),
                };
                match api.heartbeat(node_id, &req).await {
                    Ok(()) => info!(node_id = %node_id, active_tasks = count, cpu = %format!("{cpu:.1}%"), ram = %format!("{ram_pct:.1}%"), "Heartbeat sent"),
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
