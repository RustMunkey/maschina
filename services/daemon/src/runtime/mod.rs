use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::state::AppState;
use serde::{Deserialize, Serialize};

/// Output returned by the Python runtime after a successful agent execution.
#[derive(Debug, Deserialize)]
pub struct RunOutput {
    pub payload:       serde_json::Value,
    pub input_tokens:  u64,
    pub output_tokens: u64,
}

/// Request body sent to the Python runtime service.
#[derive(Debug, Serialize)]
struct RuntimeRequest<'a> {
    run_id:        uuid::Uuid,
    agent_id:      uuid::Uuid,
    user_id:       uuid::Uuid,
    input_payload: &'a serde_json::Value,
}

/// Dispatch a run to the Python runtime and await the result.
/// The caller is responsible for enforcing the timeout wrapper.
pub async fn dispatch(state: &AppState, run: &QueuedRun) -> Result<RunOutput, DaemonError> {
    let url = format!("{}/execute", state.config.runtime_url);

    let body = RuntimeRequest {
        run_id:        run.id,
        agent_id:      run.agent_id,
        user_id:       run.user_id,
        input_payload: &run.input_payload,
    };

    let response = state.http
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| DaemonError::Runtime(e.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(DaemonError::Runtime(format!("Runtime returned {status}: {body}")));
    }

    let output: RunOutput = response
        .json()
        .await
        .map_err(|e| DaemonError::Runtime(format!("Invalid runtime response: {e}")))?;

    Ok(output)
}
