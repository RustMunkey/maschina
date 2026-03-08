pub mod scan;
pub mod scan_compat;
pub mod evaluate;
pub mod execute;
pub mod analyze;

use std::time::Duration;
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, instrument};
use crate::state::AppState;

/// Main orchestration loop: SCAN → EVALUATE → EXECUTE → ANALYZE
/// Runs until the cancellation token is triggered (SIGTERM/SIGINT).
#[instrument(skip_all)]
pub async fn run(state: AppState, shutdown: CancellationToken) {
    info!("Orchestrator started. Max concurrent agents: {}", state.config.max_concurrent_agents);

    let poll_interval = Duration::from_millis(state.config.poll_interval_ms);

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                info!("Orchestrator received shutdown signal — draining in-flight work...");
                // Wait for all slots to be released (in-flight work completes)
                let _ = state.slots.acquire_many(state.config.max_concurrent_agents as u32).await;
                info!("All in-flight work drained. Orchestrator shutdown complete.");
                return;
            }
            _ = sleep(poll_interval) => {
                state.metrics.scan_cycles.inc();
                if let Err(e) = scan::scan_and_dispatch(state.clone()).await {
                    error!("Scan cycle error: {e}");
                }
            }
        }
    }
}
