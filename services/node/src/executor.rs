//! Task executor — subscribes to NATS `maschina.nodes.<id>.execute`,
//! forwards each job to the local Python runtime, and replies with the result.
//!
//! The daemon's `dispatch_nats()` sends a RuntimeRequest and blocks waiting
//! for a reply. This module is the other end of that request-reply pattern.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::heartbeat::ActiveTaskCounter;

// ── Wire types — must match daemon's RuntimeRequest / RunOutput exactly ───────

/// Task payload sent by the daemon via NATS request-reply.
#[derive(Debug, Deserialize)]
pub struct TaskRequest {
    pub run_id: Uuid,
    pub agent_id: Uuid,
    pub user_id: Uuid,
    pub plan_tier: String,
    pub model: String,
    pub system_prompt: String,
    pub max_tokens: u32,
    pub input_payload: serde_json::Value,
    pub timeout_secs: i64,
    pub skills: Vec<String>,
    pub skill_configs: serde_json::Value,
}

/// Successful execution result — forwarded directly from the Python runtime.
#[derive(Debug, Serialize, Deserialize)]
pub struct RunOutput {
    pub output_payload: serde_json::Value,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub sandbox_type: Option<String>,
}

/// Error reply sent back to daemon on failure.
#[derive(Debug, Serialize)]
struct ErrorReply {
    error: String,
}

// ── Executor loop ─────────────────────────────────────────────────────────────

pub async fn run(
    nats_url: String,
    nats_creds: Option<String>,
    nats_ca_cert: Option<String>,
    node_id: Uuid,
    runtime_url: String,
    max_concurrent: u32,
    active_tasks: ActiveTaskCounter,
    shutdown: CancellationToken,
) -> Result<()> {
    // Connect to NATS
    let client = connect_nats(&nats_url, nats_creds.as_deref(), nats_ca_cert.as_deref()).await?;

    let subject = format!("maschina.nodes.{node_id}.execute");
    // Queue group so if the binary is somehow started twice, only one handles each job
    let queue_group = format!("maschina.node.{node_id}");

    let mut sub = client.queue_subscribe(subject.clone(), queue_group).await?;

    info!(subject = %subject, "Task executor subscribed — ready for work");

    let http = Arc::new(
        reqwest::Client::builder()
            .timeout(Duration::from_secs(600)) // long timeout for heavy agent runs
            .build()?,
    );

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                info!("Executor shutting down");
                break;
            }
            msg = sub.next() => {
                let Some(msg) = msg else { break };

                // Check capacity
                let current = {
                    let count = active_tasks.lock().await;
                    *count
                };
                if current >= max_concurrent {
                    warn!(
                        current,
                        max = max_concurrent,
                        "Node at capacity — rejecting task"
                    );
                    let reply_bytes = serde_json::to_vec(&ErrorReply {
                        error: format!("node at capacity ({current}/{max_concurrent})"),
                    }).unwrap_or_default();
                    if let Some(reply_subject) = &msg.reply {
                        client.publish(reply_subject.clone(), reply_bytes.into()).await.ok();
                    }
                    continue;
                }

                // Deserialize task
                let task: TaskRequest = match serde_json::from_slice(&msg.payload) {
                    Ok(t) => t,
                    Err(e) => {
                        error!(error = %e, "Failed to deserialize task payload");
                        if let Some(reply_subject) = &msg.reply {
                            let reply = serde_json::to_vec(&ErrorReply {
                                error: format!("invalid task payload: {e}"),
                            }).unwrap_or_default();
                            client.publish(reply_subject.clone(), reply.into()).await.ok();
                        }
                        continue;
                    }
                };

                let run_id = task.run_id;
                let reply_subject = msg.reply.clone();
                let http = http.clone();
                let runtime_url = runtime_url.clone();
                let active_tasks = active_tasks.clone();
                let nats_client = client.clone();

                // Spawn a task per job — executor stays free to receive next task
                tokio::spawn(async move {
                    // Increment active count
                    { *active_tasks.lock().await += 1; }
                    info!(run_id = %run_id, "Task started");

                    let result = execute_task(&http, &runtime_url, task).await;

                    // Decrement active count
                    { *active_tasks.lock().await -= 1; }

                    let reply_bytes = match result {
                        Ok(output) => {
                            info!(run_id = %run_id, "Task completed successfully");
                            serde_json::to_vec(&output).unwrap_or_default()
                        }
                        Err(e) => {
                            error!(run_id = %run_id, error = %e, "Task failed");
                            serde_json::to_vec(&ErrorReply { error: e.to_string() })
                                .unwrap_or_default()
                        }
                    };

                    if let Some(reply_subject) = reply_subject {
                        nats_client
                            .publish(reply_subject, reply_bytes.into())
                            .await
                            .ok();
                    }
                });
            }
        }
    }

    Ok(())
}

// ── Execution: forward to local Python runtime ────────────────────────────────

async fn execute_task(
    http: &reqwest::Client,
    runtime_url: &str,
    task: TaskRequest,
) -> Result<RunOutput> {
    let url = format!("{}/run", runtime_url.trim_end_matches('/'));

    // Forward the task as-is to the local runtime
    let body = serde_json::json!({
        "run_id":       task.run_id,
        "agent_id":     task.agent_id,
        "user_id":      task.user_id,
        "plan_tier":    task.plan_tier,
        "model":        task.model,
        "system_prompt": task.system_prompt,
        "max_tokens":   task.max_tokens,
        "input_payload": task.input_payload,
        "timeout_secs": task.timeout_secs,
        "skills":       task.skills,
        "skill_configs": task.skill_configs,
    });

    let response = http
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Runtime HTTP error: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        anyhow::bail!("Runtime returned {status}: {text}");
    }

    let output: RunOutput = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse runtime response: {e}"))?;

    Ok(output)
}

// ── NATS connection ───────────────────────────────────────────────────────────

async fn connect_nats(
    url: &str,
    creds_path: Option<&str>,
    ca_cert: Option<&str>,
) -> Result<async_nats::Client> {
    let mut opts = async_nats::ConnectOptions::new()
        .name("maschina-node-executor")
        .ping_interval(Duration::from_secs(30))
        .connection_timeout(Duration::from_secs(10))
        .retry_on_initial_connect();

    if let Some(path) = creds_path {
        opts = opts
            .credentials_file(path)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to load NATS creds from {path}: {e}"))?;
    }

    if let Some(cert_path) = ca_cert {
        opts = opts
            .add_root_certificates(cert_path.into())
            .require_tls(true);
    }

    let client = opts
        .connect(url)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to connect to NATS at {url}: {e}"))?;

    info!(url = %url, "Connected to NATS");
    Ok(client)
}
