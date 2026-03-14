use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// Output returned by the Python runtime after a successful agent execution.
/// Must match services/runtime/src/models.py::RunResponse exactly.
#[derive(Debug, Deserialize)]
pub struct RunOutput {
    pub output_payload: serde_json::Value,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

/// Request body sent to the Python runtime service.
/// Must match services/runtime/src/models.py::RunRequest exactly.
#[derive(Debug, Serialize)]
struct RuntimeRequest<'a> {
    run_id: uuid::Uuid,
    agent_id: uuid::Uuid,
    user_id: uuid::Uuid,
    plan_tier: &'a str,
    model: &'a str,
    system_prompt: &'a str,
    max_tokens: u32,
    input_payload: &'a serde_json::Value,
    timeout_secs: i64,
}

/// A node row returned from the registry query.
#[derive(Debug, sqlx::FromRow)]
struct NodeRow {
    id: uuid::Uuid,
    internal_url: Option<String>,
}

/// Select the best available node URL for this run.
///
/// Phase 1 strategy: pick the most recently healthy active node.
/// Falls back to config.runtime_url if no registered nodes are available.
async fn select_node_url(state: &AppState) -> String {
    let result = sqlx::query_as::<_, NodeRow>(
        r#"
        SELECT id, internal_url
        FROM nodes
        WHERE status = 'active'
          AND internal_url IS NOT NULL
          AND last_heartbeat_at > NOW() - INTERVAL '60 seconds'
        ORDER BY last_heartbeat_at DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(node)) => {
            if let Some(url) = node.internal_url {
                info!(node_id = %node.id, url = %url, "Routing run to registered node");
                return url;
            }
        }
        Ok(None) => {
            warn!("No active registered nodes — falling back to RUNTIME_URL");
        }
        Err(e) => {
            warn!(error = %e, "Node registry query failed — falling back to RUNTIME_URL");
        }
    }

    state.config.runtime_url.clone()
}

/// Dispatch a run to the best available node and await the result.
/// The caller is responsible for enforcing the timeout wrapper.
pub async fn dispatch(state: &AppState, run: &QueuedRun) -> Result<RunOutput, DaemonError> {
    let node_url = select_node_url(state).await;
    let url = format!("{}/run", node_url.trim_end_matches('/'));

    let body = RuntimeRequest {
        run_id: run.id,
        agent_id: run.agent_id,
        user_id: run.user_id,
        plan_tier: &run.plan_tier,
        model: &run.model,
        system_prompt: &run.system_prompt,
        max_tokens: 4096,
        input_payload: &run.input_payload,
        timeout_secs: run.timeout_secs,
    };

    let response = state
        .http
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| DaemonError::Runtime(e.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(DaemonError::Runtime(format!(
            "Runtime returned {status}: {body}"
        )));
    }

    let output: RunOutput = response
        .json()
        .await
        .map_err(|e| DaemonError::Runtime(format!("Invalid runtime response: {e}")))?;

    Ok(output)
}
