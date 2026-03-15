use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::time::Duration;

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

/// Dispatch a run to a node via HTTP and await the result.
/// Used for nodes with a registered internal_url.
pub async fn dispatch_http(
    state: &AppState,
    run: &QueuedRun,
    node_url: &str,
) -> Result<RunOutput, DaemonError> {
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
        let text = response.text().await.unwrap_or_default();
        return Err(DaemonError::Runtime(format!(
            "Runtime returned {status}: {text}"
        )));
    }

    response
        .json::<RunOutput>()
        .await
        .map_err(|e| DaemonError::Runtime(format!("Invalid runtime response: {e}")))
}

/// Dispatch a run to a NATS-only node (home user behind NAT) via request-reply.
/// Publishes to `maschina.nodes.<node_id>.execute` and waits for a reply.
/// The node binary proxies the request to its local runtime and replies with the result.
pub async fn dispatch_nats(
    state: &AppState,
    run: &QueuedRun,
    node_id: uuid::Uuid,
) -> Result<RunOutput, DaemonError> {
    let subject = format!("maschina.nodes.{node_id}.execute");

    // Serialize the full RuntimeRequest as the NATS payload
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

    let payload = serde_json::to_vec(&body)
        .map_err(|e| DaemonError::Runtime(format!("Serialization failed: {e}")))?;

    // NATS request-reply with a generous timeout (task execution can take minutes)
    let reply = tokio::time::timeout(
        Duration::from_secs(run.timeout_secs as u64 + 30),
        state.nats.request(subject.clone(), payload.into()),
    )
    .await
    .map_err(|_| DaemonError::Runtime(format!("NATS dispatch to node {node_id} timed out")))?
    .map_err(|e| DaemonError::Runtime(format!("NATS request failed: {e}")))?;

    // Check for error envelope from node binary
    if let Ok(err) = serde_json::from_slice::<serde_json::Value>(&reply.payload) {
        if let Some(msg) = err.get("error").and_then(|e| e.as_str()) {
            return Err(DaemonError::Runtime(format!("Node error: {msg}")));
        }
    }

    serde_json::from_slice::<RunOutput>(&reply.payload)
        .map_err(|e| DaemonError::Runtime(format!("Invalid NATS reply: {e}")))
}

/// Compatibility shim — kept so callers that pass a URL string still work.
/// Delegates to `dispatch_http`.
#[allow(dead_code)]
pub async fn dispatch_to(
    state: &AppState,
    run: &QueuedRun,
    node_url: &str,
) -> Result<RunOutput, DaemonError> {
    dispatch_http(state, run, node_url).await
}
