use anyhow::Result;
use futures_util::StreamExt;
use tokio_util::sync::CancellationToken;

use crate::{registry, state::AppState};

/// Subjects the realtime service fans out to connected clients.
/// These match subjects published by services/api and services/daemon.
const SUBJECTS: &[&str] = &[
    "maschina.agents.run.>",
    "maschina.notifications.>",
    "maschina.billing.>",
    "maschina.usage.>",
];

/// Start a background task that subscribes to relevant NATS subjects and
/// fans out incoming events to connected WebSocket / SSE clients.
///
/// NATS JetStream `js.publish()` calls are also delivered to any matching
/// core subscriber, so we don't need a JetStream consumer here.
pub async fn start_fan_out(state: AppState, shutdown: CancellationToken) -> Result<()> {
    let mut handles = Vec::new();

    for subject in SUBJECTS {
        let sub = state.nats.subscribe(*subject).await?;
        let registry = state.registry.clone();
        let shutdown = shutdown.clone();
        let subject_str = subject.to_string();

        let handle = tokio::spawn(async move {
            fan_out_subject(sub, registry, subject_str, shutdown).await;
        });
        handles.push(handle);
    }

    for handle in handles {
        let _ = handle.await;
    }

    Ok(())
}

async fn fan_out_subject(
    mut sub: async_nats::Subscriber,
    registry: registry::Registry,
    subject: String,
    shutdown: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                tracing::info!(subject = %subject, "nats fan-out shutting down");
                break;
            }
            msg = sub.next() => {
                let Some(msg) = msg else { break };

                let payload = match std::str::from_utf8(&msg.payload) {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                // Parse the EventEnvelope to find the target userId.
                // Envelope shape: { id, timestamp, version, subject, data: { userId, ... } }
                let user_id = match extract_user_id(payload) {
                    Some(id) => id,
                    None => {
                        tracing::debug!(subject = %msg.subject, "event has no userId, skipping fan-out");
                        continue;
                    }
                };

                let sent = registry::send_to_user(&registry, &user_id, payload.to_string());
                tracing::debug!(
                    subject = %msg.subject,
                    user_id = %user_id,
                    receivers = sent,
                    "event fanned out"
                );
            }
        }
    }
}

/// Extract `data.userId` from an event envelope JSON string.
fn extract_user_id(payload: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(payload).ok()?;
    v.get("data")
        .and_then(|d| d.get("userId"))
        .and_then(|id| id.as_str())
        .map(|s| s.to_string())
}
