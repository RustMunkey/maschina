use crate::error::{DaemonError, Result};
use crate::state::AppState;
use async_nats::jetstream::consumer::pull::Config as PullConfig;
use async_nats::jetstream::consumer::AckPolicy;
use async_nats::jetstream::stream::RetentionPolicy;
use tracing::{debug, error, info, instrument, warn};
use uuid::Uuid;

const STREAM_NAME: &str = "MASCHINA_JOBS";
const CONSUMER_NAME: &str = "daemon-agent-execute";
const FILTER_SUBJECT: &str = "maschina.jobs.agent.agent.execute";

/// A deserialized agent execution job from NATS.
#[derive(Debug, serde::Deserialize)]
pub struct AgentExecuteJob {
    pub run_id: Uuid,
    pub agent_id: Uuid,
    pub user_id: Uuid,
    pub tier: String,
    pub model: String,
    pub system_prompt: String,
    pub input_payload: serde_json::Value,
    pub timeout_secs: u64,
}

/// Wraps the NATS envelope to extract the job payload.
#[derive(Debug, serde::Deserialize)]
struct JobEnvelope {
    #[allow(dead_code)]
    id: String,
    data: AgentExecuteJob,
}

/// SCAN phase: pull a batch of agent execute jobs from NATS JetStream.
/// For each job, mark it executing in PostgreSQL then spawn a task.
#[instrument(skip_all)]
pub async fn scan_and_dispatch(state: AppState) -> Result<()> {
    let available = state.slots.available_permits();
    if available == 0 {
        debug!("All semaphore slots occupied — skipping scan");
        return Ok(());
    }

    let batch_size = available.min(state.config.max_concurrent_agents) as u32;

    // Ensure the stream + consumer exist (idempotent)
    ensure_stream_and_consumer(&state).await?;

    let consumer = state
        .jetstream
        .get_consumer_from_stream(CONSUMER_NAME, STREAM_NAME)
        .await
        .map_err(|e| DaemonError::Runtime(format!("NATS get consumer: {e}")))?;

    let mut messages = consumer
        .fetch()
        .max_messages(batch_size as usize)
        .expires(std::time::Duration::from_millis(500))
        .messages()
        .await
        .map_err(|e| DaemonError::Runtime(format!("NATS fetch: {e}")))?;

    let mut dispatched = 0usize;

    while let Some(msg) = futures::StreamExt::next(&mut messages).await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                warn!("NATS message error: {e}");
                continue;
            }
        };

        let envelope: JobEnvelope = match serde_json::from_slice(&msg.payload) {
            Ok(e) => e,
            Err(e) => {
                error!("Failed to deserialize job envelope: {e}");
                // Permanently discard malformed messages
                let _ = msg.ack_with(async_nats::jetstream::AckKind::Term).await;
                continue;
            }
        };

        let job = envelope.data;

        // Mark as 'executing' in PostgreSQL before spawning.
        // If the update hits 0 rows, the run was already claimed or canceled.
        let updated = sqlx::query(
            "UPDATE agent_runs SET status = 'executing', started_at = NOW() WHERE id = $1 AND status = 'queued'"
        )
        .bind(job.run_id)
        .execute(&state.db)
        .await?
        .rows_affected();

        if updated == 0 {
            warn!(run_id = %job.run_id, "Run already claimed or canceled, discarding job");
            let _ = msg.ack().await;
            continue;
        }

        state.metrics.runs_queued.dec();
        state.metrics.runs_executing.inc();
        dispatched += 1;

        let permit = state
            .slots
            .clone()
            .acquire_owned()
            .await
            .expect("Semaphore closed — this is a bug");

        let state_clone = state.clone();

        tokio::spawn(async move {
            let _permit = permit;

            // Convert to the QueuedRun type that evaluate/execute/analyze expect
            let run = crate::orchestrator::scan_compat::JobToRun {
                id: job.run_id,
                agent_id: job.agent_id,
                user_id: job.user_id,
                plan_tier: job.tier,
                model: job.model,
                system_prompt: job.system_prompt,
                input_payload: job.input_payload,
                timeout_secs: job.timeout_secs as i64,
                // Skills are resolved in the EVALUATE phase from agent_skills table
                skills: vec![],
                skill_configs: serde_json::Value::Object(Default::default()),
            };

            // Ack the NATS message after we've successfully claimed the DB row.
            // From here, the run's fate is tracked in PostgreSQL, not NATS.
            let _ = msg.ack().await;

            super::evaluate::evaluate_and_execute(state_clone, run).await;
        });
    }

    if dispatched > 0 {
        info!(count = dispatched, "Dispatched agent runs from NATS");
    }

    Ok(())
}

/// Ensure the MASCHINA_JOBS stream and daemon consumer exist.
async fn ensure_stream_and_consumer(state: &AppState) -> Result<()> {
    // Stream
    let stream_config = async_nats::jetstream::stream::Config {
        name: STREAM_NAME.to_string(),
        subjects: vec!["maschina.jobs.>".to_string()],
        retention: RetentionPolicy::WorkQueue,
        max_age: std::time::Duration::from_secs(24 * 60 * 60), // 24h
        ..Default::default()
    };

    match state.jetstream.get_or_create_stream(stream_config).await {
        Ok(_) => {}
        Err(e) => return Err(DaemonError::Runtime(format!("NATS stream setup: {e}"))),
    }

    // Pull consumer
    let consumer_config = PullConfig {
        durable_name: Some(CONSUMER_NAME.to_string()),
        filter_subject: FILTER_SUBJECT.to_string(),
        ack_policy: AckPolicy::Explicit,
        max_deliver: 5,
        ack_wait: std::time::Duration::from_secs(30),
        ..Default::default()
    };

    let stream = state
        .jetstream
        .get_stream(STREAM_NAME)
        .await
        .map_err(|e| DaemonError::Runtime(format!("NATS get stream: {e}")))?;

    stream
        .get_or_create_consumer(CONSUMER_NAME, consumer_config)
        .await
        .map(|_| ())
        .map_err(|e| DaemonError::Runtime(format!("NATS consumer setup: {e}")))
}
