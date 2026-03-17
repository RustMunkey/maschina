use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::scheduler::NodeDispatch;
use crate::state::AppState;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{error, info, instrument, warn};

/// EXECUTE phase: dispatch to the selected node with a hard timeout, then hand off to ANALYZE.
#[instrument(skip(state, run), fields(run_id = %run.id, agent_id = %run.agent_id))]
pub async fn execute_run(state: AppState, run: QueuedRun) {
    let timeout_dur = Duration::from_secs(run.timeout_secs as u64);

    // Select node before starting the timeout clock so scheduling latency
    // doesn't eat into the agent's execution budget.
    let dispatch = crate::scheduler::select_node(&state, &run.model).await;

    let node_id = match &dispatch {
        NodeDispatch::Http { node_id, url } => {
            info!(
                run_id = %run.id,
                timeout_secs = run.timeout_secs,
                node_url = %url,
                node_id = %node_id,
                dispatch = "http",
                "Executing agent run"
            );
            Some(*node_id)
        }
        NodeDispatch::Nats { node_id } => {
            info!(
                run_id = %run.id,
                timeout_secs = run.timeout_secs,
                node_id = %node_id,
                dispatch = "nats",
                "Executing agent run via NATS"
            );
            Some(*node_id)
        }
        NodeDispatch::InternalFallback { url } => {
            info!(
                run_id = %run.id,
                timeout_secs = run.timeout_secs,
                runtime_url = %url,
                dispatch = "internal_fallback",
                "Executing agent run on internal runtime"
            );
            None
        }
    };

    let start = std::time::Instant::now();
    let result = timeout(timeout_dur, dispatch_run(&state, &run, dispatch)).await;
    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(output)) => {
            info!(run_id = %run.id, "Agent run completed successfully");
            super::analyze::finalize_run(&state, &run, Ok(output), node_id, elapsed_ms).await;
            state.metrics.runs_executing.dec();
            state.metrics.runs_completed.inc();
        }
        Ok(Err(e)) => {
            warn!(run_id = %run.id, error = %e, "Agent run returned error");
            super::analyze::finalize_run(&state, &run, Err(e), node_id, elapsed_ms).await;
            state.metrics.runs_executing.dec();
            state.metrics.runs_failed.inc();
        }
        Err(_elapsed) => {
            error!(run_id = %run.id, timeout_secs = run.timeout_secs, "Agent run timed out");
            let err = DaemonError::Timeout {
                run_id: run.id,
                timeout_secs: run.timeout_secs as u64,
            };
            super::analyze::finalize_run(&state, &run, Err(err), node_id, elapsed_ms).await;
            state.metrics.runs_executing.dec();
            state.metrics.runs_timed_out.inc();
        }
    }
}

/// Route to the correct dispatch strategy based on the scheduler's decision.
async fn dispatch_run(
    state: &AppState,
    run: &QueuedRun,
    dispatch: NodeDispatch,
) -> Result<crate::runtime::RunOutput, DaemonError> {
    match dispatch {
        NodeDispatch::Http { url, .. } => crate::runtime::dispatch_http(state, run, &url).await,
        NodeDispatch::Nats { node_id } => crate::runtime::dispatch_nats(state, run, node_id).await,
        NodeDispatch::InternalFallback { url } => {
            crate::runtime::dispatch_http(state, run, &url).await
        }
    }
}
