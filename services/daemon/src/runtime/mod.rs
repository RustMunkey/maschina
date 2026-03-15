use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::state::AppState;
use serde::{Deserialize, Serialize};

/// Output returned by the Python runtime after a successful agent execution.
/// Must match services/runtime/src/models.py::RunResponse exactly.
#[derive(Debug, Deserialize)]
pub struct RunOutput {
    pub output_payload: serde_json::Value,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub sandbox_type: Option<String>,
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
    skills: &'a [String],
    skill_configs: &'a serde_json::Value,
}

/// Dispatch a run to the best available node and await the result.
/// The caller is responsible for enforcing the timeout wrapper.
pub async fn dispatch(state: &AppState, run: &QueuedRun) -> Result<RunOutput, DaemonError> {
    let node_url = crate::scheduler::select_node(state, &run.model).await;
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
        skills: &run.skills,
        skill_configs: &run.skill_configs,
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
