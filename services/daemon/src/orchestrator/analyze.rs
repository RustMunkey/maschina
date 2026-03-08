use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::runtime::RunOutput;
use crate::state::AppState;
use tracing::{error, instrument, warn};

/// ANALYZE phase: persist run outcome, record usage, notify realtime service.
#[instrument(skip(state, run, result), fields(run_id = %run.id))]
pub async fn finalize_run(
    state: &AppState,
    run: &QueuedRun,
    result: Result<RunOutput, DaemonError>,
) {
    match result {
        Ok(output) => {
            if let Err(e) = persist_success(state, run, &output).await {
                error!(run_id = %run.id, error = %e, "Failed to persist run success");
            }
            if let Err(e) = record_usage(state, run, &output).await {
                warn!(run_id = %run.id, error = %e, "Failed to record run usage");
            }
            notify_realtime(state, run, "completed", None).await;
        }

        Err(DaemonError::Timeout { .. }) => {
            if let Err(e) = persist_failure(
                state,
                run,
                "timed_out",
                "timeout",
                "Agent run exceeded time limit",
            )
            .await
            {
                error!(run_id = %run.id, error = %e, "Failed to persist timeout");
            }
            notify_realtime(state, run, "timed_out", Some("timeout")).await;
        }

        Err(e) => {
            let (code, msg) = error_code_and_message(&e);
            if let Err(pe) = persist_failure(state, run, "failed", code, msg).await {
                error!(run_id = %run.id, error = %pe, "Failed to persist run failure");
            }
            notify_realtime(state, run, "failed", Some(code)).await;
        }
    }
}

async fn persist_success(
    state: &AppState,
    run: &QueuedRun,
    output: &RunOutput,
) -> crate::error::Result<()> {
    sqlx::query(
        r#"
        UPDATE agent_runs
        SET status         = 'completed',
            finished_at    = NOW(),
            output_payload = $1,
            input_tokens   = $2,
            output_tokens  = $3
        WHERE id = $4
        "#,
    )
    .bind(&output.payload)
    .bind(output.input_tokens as i64)
    .bind(output.output_tokens as i64)
    .bind(run.id)
    .execute(&state.db)
    .await?;

    Ok(())
}

async fn persist_failure(
    state: &AppState,
    run: &QueuedRun,
    status: &str,
    error_code: &str,
    error_message: &str,
) -> crate::error::Result<()> {
    sqlx::query(
        r#"
        UPDATE agent_runs
        SET status        = $1,
            finished_at   = NOW(),
            error_code    = $2,
            error_message = $3
        WHERE id = $4
        "#,
    )
    .bind(status)
    .bind(error_code)
    .bind(error_message)
    .bind(run.id)
    .execute(&state.db)
    .await?;

    Ok(())
}

async fn record_usage(
    state: &AppState,
    run: &QueuedRun,
    output: &RunOutput,
) -> crate::error::Result<()> {
    let month = chrono::Utc::now().format("%Y-%m").to_string();
    let uid = run.user_id.to_string();

    // Increment agent_execution counter
    let exec_key = format!("quota:{}:agent_execution:{}", uid, month);
    let token_key = format!("quota:{}:model_tokens:{}", uid, month);

    let total_tokens = (output.input_tokens + output.output_tokens) as i64;

    let mut pipe = redis::pipe();
    pipe.atomic()
        .incr(&exec_key, 1_i64)
        .expire(&exec_key, seconds_until_month_end())
        .incr(&token_key, total_tokens)
        .expire(&token_key, seconds_until_month_end());

    let _: Vec<redis::Value> = pipe
        .query_async(&mut state.redis.clone())
        .await
        .map_err(|e| DaemonError::Redis(e))?;

    // Fire-and-forget usage event to PostgreSQL
    let db = state.db.clone();
    let run_id = run.id;
    let user_id = run.user_id;
    let agent_id = run.agent_id;
    let input_tokens = output.input_tokens as i64;
    let output_tokens = output.output_tokens as i64;

    tokio::spawn(async move {
        let _ = sqlx::query(
            r#"
            INSERT INTO usage_events (id, user_id, run_id, agent_id, event_type, units, input_tokens, output_tokens, recorded_at)
            VALUES (gen_random_uuid(), $1, $2, $3, 'agent_execution', 1, $4, $5, NOW())
            "#,
        )
        .bind(user_id)
        .bind(run_id)
        .bind(agent_id)
        .bind(input_tokens)
        .bind(output_tokens)
        .execute(&db)
        .await;
    });

    Ok(())
}

async fn notify_realtime(
    state: &AppState,
    run: &QueuedRun,
    status: &str,
    error_code: Option<&str>,
) {
    let payload = serde_json::json!({
        "type": "run:status",
        "runId": run.id,
        "userId": run.user_id,
        "agentId": run.agent_id,
        "status": status,
        "errorCode": error_code,
    });

    let url = format!("{}/internal/run-event", state.config.realtime_url);
    let result = state.http.post(&url).json(&payload).send().await;

    if let Err(e) = result {
        warn!(run_id = %run.id, error = %e, "Failed to notify realtime service");
    }
}

fn error_code_and_message(e: &DaemonError) -> (&'static str, &'static str) {
    match e {
        DaemonError::QuotaExceeded { .. } => ("quota_exceeded", "Monthly quota exceeded"),
        DaemonError::AgentNotFound { .. } => ("agent_not_found", "Agent not found"),
        DaemonError::Sandbox(_) => ("sandbox_error", "Sandbox execution error"),
        DaemonError::Runtime(_) => ("runtime_error", "Runtime error"),
        DaemonError::Timeout { .. } => ("timeout", "Agent run exceeded time limit"),
        _ => ("internal_error", "Internal daemon error"),
    }
}

fn seconds_until_month_end() -> i64 {
    use chrono::{Datelike, TimeZone, Utc};
    let now = Utc::now();
    let year = now.year();
    let month = now.month();
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let end = Utc
        .with_ymd_and_hms(next_year, next_month, 1, 0, 0, 0)
        .unwrap();
    (end - now).num_seconds().max(1)
}
