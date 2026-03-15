//! Task watchdog — detects and reaps stalled/zombie agent runs.
//!
//! A run can get stuck in `running` status if:
//!   - The runtime process crashed mid-run
//!   - A NATS message was lost/redelivered after processing started
//!   - The daemon instance was killed ungracefully during execution
//!
//! The watchdog sweeps `agent_runs` on a configurable interval, finds runs
//! that have been `running` longer than `watchdog_timeout_secs`, and forces
//! them through the ANALYZE phase with `error_code = "watchdog_timeout"`.
//! This ensures reputation scores and realtime events are always consistent.

use crate::error::DaemonError;
use crate::orchestrator::analyze;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::state::AppState;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, instrument, warn};
use uuid::Uuid;

/// How often the watchdog sweeps for stalled runs (seconds).
const WATCHDOG_INTERVAL_SECS: u64 = 30;

/// Fallback timeout if `watchdog_timeout_secs` is not set in config.
/// Slightly longer than the default AGENT_TIMEOUT_SECS (300s) so the normal
/// timeout path fires first; the watchdog is purely a safety net.
const DEFAULT_WATCHDOG_TIMEOUT_SECS: i64 = 600;

struct StuckRun {
    id: Uuid,
    agent_id: Uuid,
    user_id: Uuid,
    model: String,
}

/// Spawn the watchdog loop. Runs independently of the orchestrator poll loop.
pub async fn run(state: AppState, shutdown: CancellationToken) {
    let interval = Duration::from_secs(WATCHDOG_INTERVAL_SECS);
    info!("Task watchdog started (sweep interval: {WATCHDOG_INTERVAL_SECS}s)");

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                info!("Task watchdog shutting down.");
                return;
            }
            _ = tokio::time::sleep(interval) => {
                sweep(&state).await;
            }
        }
    }
}

#[instrument(skip(state))]
async fn sweep(state: &AppState) {
    let timeout_secs = state
        .config
        .watchdog_timeout_secs
        .unwrap_or(DEFAULT_WATCHDOG_TIMEOUT_SECS);

    let stuck = match find_stuck_runs(state, timeout_secs).await {
        Ok(r) => r,
        Err(e) => {
            error!(error = %e, "Watchdog sweep failed to query stuck runs");
            return;
        }
    };

    if stuck.is_empty() {
        return;
    }

    warn!(count = stuck.len(), "Watchdog found stuck runs — reaping");

    for run in stuck {
        reap(state, run, timeout_secs).await;
    }
}

async fn find_stuck_runs(
    state: &AppState,
    timeout_secs: i64,
) -> crate::error::Result<Vec<StuckRun>> {
    let rows = sqlx::query(
        r#"
        SELECT id, agent_id, user_id, model
        FROM agent_runs
        WHERE status = 'running'
          AND started_at < NOW() - ($1 || ' seconds')::interval
        "#,
    )
    .bind(timeout_secs.to_string())
    .fetch_all(&state.db)
    .await?;

    use sqlx::Row as _;
    Ok(rows
        .into_iter()
        .map(|r| StuckRun {
            id: r.get("id"),
            agent_id: r.get("agent_id"),
            user_id: r.get("user_id"),
            model: r.get("model"),
        })
        .collect())
}

async fn reap(state: &AppState, stuck: StuckRun, timeout_secs: i64) {
    warn!(run_id = %stuck.id, "Watchdog reaping stuck run");

    // Mark the run failed directly — the DB is the source of truth.
    // We use `WHERE status = 'running'` to avoid a race with a concurrent
    // normal completion that snuck in between our SELECT and this UPDATE.
    let result = sqlx::query(
        r#"
        UPDATE agent_runs
        SET status        = 'failed',
            finished_at   = NOW(),
            error_code    = 'watchdog_timeout',
            error_message = 'Run exceeded watchdog timeout and was forcibly terminated'
        WHERE id = $1 AND status = 'running'
        "#,
    )
    .bind(stuck.id)
    .execute(&state.db)
    .await;

    match result {
        Err(e) => {
            error!(run_id = %stuck.id, error = %e, "Watchdog failed to update stuck run");
            return;
        }
        Ok(r) if r.rows_affected() == 0 => {
            // Race: run completed normally between our SELECT and UPDATE — no-op.
            return;
        }
        Ok(_) => {}
    }

    // Synthesise a minimal QueuedRun so we can reuse analyze helpers
    // (reputation update + realtime notification). Fields unused by the
    // failure path are zeroed/empty.
    let synthetic_run = QueuedRun {
        id: stuck.id,
        agent_id: stuck.agent_id,
        user_id: stuck.user_id,
        plan_tier: String::new(),
        model: stuck.model,
        system_prompt: String::new(),
        input_payload: serde_json::Value::Null,
        timeout_secs,
        skills: vec![],
        skill_configs: serde_json::Value::Null,
    };

    // node_id is unknown — the node that was running this may have crashed.
    // We skip node reputation update (None) but still update agent reputation
    // and notify realtime.
    analyze::finalize_run(
        state,
        &synthetic_run,
        Err(DaemonError::Timeout {
            run_id: stuck.id,
            timeout_secs: timeout_secs as u64,
        }),
        None,
    )
    .await;
}
