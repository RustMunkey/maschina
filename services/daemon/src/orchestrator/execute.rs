use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::state::AppState;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{error, info, instrument, warn};

/// EXECUTE phase: dispatch to the Python runtime with a hard timeout,
/// then hand off to ANALYZE.
#[instrument(skip(state, run), fields(run_id = %run.id, agent_id = %run.agent_id))]
pub async fn execute_run(state: AppState, run: QueuedRun) {
    let timeout_dur = Duration::from_secs(run.timeout_secs as u64);

    // Select node before starting the timeout clock so scheduling latency
    // doesn't eat into the agent's execution budget.
    let (node_url, node_id) = crate::scheduler::select_node(&state, &run.model).await;

    info!(
        run_id = %run.id,
        timeout_secs = run.timeout_secs,
        node_url = %node_url,
        node_id = ?node_id,
        "Executing agent run"
    );

    let result = timeout(
        timeout_dur,
        crate::runtime::dispatch_to(&state, &run, &node_url),
    )
    .await;

    match result {
        // Runtime completed within timeout
        Ok(Ok(output)) => {
            info!(run_id = %run.id, "Agent run completed successfully");
            super::analyze::finalize_run(&state, &run, Ok(output), node_id).await;
            state.metrics.runs_executing.dec();
            state.metrics.runs_completed.inc();
        }

        // Runtime returned an error
        Ok(Err(e)) => {
            warn!(run_id = %run.id, error = %e, "Agent run returned error");
            super::analyze::finalize_run(&state, &run, Err(e), node_id).await;
            state.metrics.runs_executing.dec();
            state.metrics.runs_failed.inc();
        }

        // Hard timeout
        Err(_elapsed) => {
            error!(run_id = %run.id, timeout_secs = run.timeout_secs, "Agent run timed out");
            let err = DaemonError::Timeout {
                run_id: run.id,
                timeout_secs: run.timeout_secs as u64,
            };
            super::analyze::finalize_run(&state, &run, Err(err), node_id).await;
            state.metrics.runs_executing.dec();
            state.metrics.runs_timed_out.inc();
        }
    }
}
