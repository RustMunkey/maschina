use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::runtime::RunOutput;
use crate::state::AppState;
use tracing::{error, instrument, warn};
use uuid::Uuid;

/// ANALYZE phase: persist run outcome, record usage, update reputation, notify realtime.
#[instrument(skip(state, run, result), fields(run_id = %run.id))]
pub async fn finalize_run(
    state: &AppState,
    run: &QueuedRun,
    result: Result<RunOutput, DaemonError>,
    node_id: Option<Uuid>,
) {
    match result {
        Ok(output) => {
            if let Err(e) = persist_success(state, run, &output).await {
                error!(run_id = %run.id, error = %e, "Failed to persist run success");
            }
            crate::receipt::issue_receipt(state, run, &output).await;
            if let Err(e) = record_usage(state, run, &output).await {
                warn!(run_id = %run.id, error = %e, "Failed to record run usage");
            }
            record_node_earnings(state, run, &output, node_id);
            update_node_reputation(state, node_id, "success");
            update_agent_reputation(state, run.agent_id, "success");
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
            update_node_reputation(state, node_id, "timed_out");
            update_agent_reputation(state, run.agent_id, "failed");
            notify_realtime(state, run, "timed_out", Some("timeout")).await;
        }

        Err(e) => {
            let (code, msg) = error_code_and_message(&e);
            if let Err(pe) = persist_failure(state, run, "failed", code, msg).await {
                error!(run_id = %run.id, error = %pe, "Failed to persist run failure");
            }
            update_node_reputation(state, node_id, "failed");
            update_agent_reputation(state, run.agent_id, "failed");
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
            output_tokens  = $3,
            sandbox_type   = $4
        WHERE id = $5
        "#,
    )
    .bind(&output.output_payload)
    .bind(output.input_tokens as i64)
    .bind(output.output_tokens as i64)
    .bind(&output.sandbox_type)
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
    let exec_key = format!("quota:{uid}:agent_execution:{month}");
    let token_key = format!("quota:{uid}:model_tokens:{month}");

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
        .map_err(DaemonError::Redis)?;

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

// ─── Pricing helpers ──────────────────────────────────────────────────────────

/// Billing multiplier by model prefix. Matches packages/model/src/catalog.ts.
fn billing_multiplier(model: &str) -> f64 {
    if model.starts_with("ollama/") {
        return 0.0; // local models are free
    }
    // Anthropic
    if model.contains("haiku") {
        return 1.0;
    }
    if model.contains("sonnet") {
        return 3.0;
    }
    if model.contains("opus") {
        return 15.0;
    }
    // OpenAI
    if model == "o3-pro" {
        return 30.0;
    }
    if model == "o3" {
        return 20.0;
    }
    if model == "o3-mini" {
        return 8.0;
    }
    if model.starts_with("gpt-5.4-pro") {
        return 12.0;
    }
    if model.starts_with("gpt-5.4") {
        return 6.0;
    }
    if model.starts_with("gpt-5") && model.ends_with("mini") {
        return 1.0;
    }
    if model.starts_with("gpt-5") && model.ends_with("nano") {
        return 0.5;
    }
    if model.starts_with("gpt-5") {
        return 8.0;
    }
    2.0 // unknown — conservative default
}

/// Compute total task price in cents.
/// Rate: $0.002 / 1k tokens × multiplier + $0.01 per execution.
/// Matches PRICING_RATES in packages/billing/src/pricing.ts.
fn task_price_cents(input_tokens: i64, output_tokens: i64, model: &str) -> i64 {
    let total_tokens = (input_tokens + output_tokens) as f64;
    let multiplier = billing_multiplier(model);
    let token_cents = (total_tokens / 1000.0 * 0.2 * multiplier).ceil() as i64;
    let execution_cents = 1_i64; // $0.01 per run
    token_cents + execution_cents
}

/// Fire-and-forget: write a node_earnings row for this successful run.
/// Applies the 65/20/10/5 split (node/developer/treasury/validators).
fn record_node_earnings(
    state: &AppState,
    run: &QueuedRun,
    output: &RunOutput,
    node_id: Option<Uuid>,
) {
    let Some(nid) = node_id else {
        return; // internal fallback runtime — no node to credit
    };

    let db = state.db.clone();
    let run_id = run.id;
    let agent_id = run.agent_id;
    let user_id = run.user_id;
    let model = run.model.clone();
    let input_tokens = output.input_tokens as i64;
    let output_tokens = output.output_tokens as i64;
    let multiplier = billing_multiplier(&model);

    tokio::spawn(async move {
        let total = task_price_cents(input_tokens, output_tokens, &model);
        let node_cents = (total as f64 * 0.65).floor() as i64;
        let developer_cents = (total as f64 * 0.20).floor() as i64;
        let treasury_cents = (total as f64 * 0.10).floor() as i64;
        let validator_cents = total - node_cents - developer_cents - treasury_cents;

        let _ = sqlx::query(
            r#"
            INSERT INTO node_earnings (
                id, node_id, run_id, agent_id, user_id, model,
                input_tokens, output_tokens, billing_multiplier,
                total_cents, node_cents, developer_cents, treasury_cents, validator_cents,
                status, created_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9, $10, $11, $12, $13,
                'pending', NOW()
            )
            "#,
        )
        .bind(nid)
        .bind(run_id)
        .bind(agent_id)
        .bind(user_id)
        .bind(&model)
        .bind(input_tokens)
        .bind(output_tokens)
        .bind(multiplier)
        .bind(total)
        .bind(node_cents)
        .bind(developer_cents)
        .bind(treasury_cents)
        .bind(validator_cents)
        .execute(&db)
        .await;
    });
}

/// Fire-and-forget: update node counters + recalculate reputation_score.
///
/// Score formula: completed / (completed + failed + timed_out) * 100,
/// clamped 0–100. Nodes with fewer than 5 total tasks stay at their current
/// score (not enough signal to move far from the default 50).
fn update_node_reputation(state: &AppState, node_id: Option<Uuid>, outcome: &'static str) {
    let Some(id) = node_id else {
        return; // internal fallback runtime — no node row to update
    };
    let db = state.db.clone();
    tokio::spawn(async move {
        let sql = match outcome {
            "success" => {
                r#"
                UPDATE nodes
                SET total_tasks_completed = total_tasks_completed + 1,
                    reputation_score = CASE
                        WHEN (total_tasks_completed + 1 + total_tasks_failed + total_tasks_timed_out) < 5
                        THEN reputation_score
                        ELSE LEAST(100, GREATEST(0,
                            ((total_tasks_completed + 1)::numeric /
                             (total_tasks_completed + 1 + total_tasks_failed + total_tasks_timed_out)::numeric) * 100
                        ))
                    END,
                    updated_at = NOW()
                WHERE id = $1
                "#
            }
            "failed" => {
                r#"
                UPDATE nodes
                SET total_tasks_failed = total_tasks_failed + 1,
                    reputation_score = CASE
                        WHEN (total_tasks_completed + total_tasks_failed + 1 + total_tasks_timed_out) < 5
                        THEN reputation_score
                        ELSE LEAST(100, GREATEST(0,
                            (total_tasks_completed::numeric /
                             (total_tasks_completed + total_tasks_failed + 1 + total_tasks_timed_out)::numeric) * 100
                        ))
                    END,
                    updated_at = NOW()
                WHERE id = $1
                "#
            }
            _ => {
                // timed_out
                r#"
                UPDATE nodes
                SET total_tasks_timed_out = total_tasks_timed_out + 1,
                    reputation_score = CASE
                        WHEN (total_tasks_completed + total_tasks_failed + total_tasks_timed_out + 1) < 5
                        THEN reputation_score
                        ELSE LEAST(100, GREATEST(0,
                            (total_tasks_completed::numeric /
                             (total_tasks_completed + total_tasks_failed + total_tasks_timed_out + 1)::numeric) * 100
                        ))
                    END,
                    updated_at = NOW()
                WHERE id = $1
                "#
            }
        };
        let _ = sqlx::query(sql).bind(id).execute(&db).await;
    });
}

/// Fire-and-forget: update agent run counters + recalculate reputation_score.
fn update_agent_reputation(state: &AppState, agent_id: Uuid, outcome: &'static str) {
    let db = state.db.clone();
    tokio::spawn(async move {
        let sql = match outcome {
            "success" => {
                r#"
                UPDATE agents
                SET total_runs_completed = total_runs_completed + 1,
                    reputation_score = CASE
                        WHEN (total_runs_completed + 1 + total_runs_failed) < 5
                        THEN reputation_score
                        ELSE LEAST(100, GREATEST(0,
                            ((total_runs_completed + 1)::numeric /
                             (total_runs_completed + 1 + total_runs_failed)::numeric) * 100
                        ))
                    END,
                    updated_at = NOW()
                WHERE id = $1
                "#
            }
            _ => {
                r#"
                UPDATE agents
                SET total_runs_failed = total_runs_failed + 1,
                    reputation_score = CASE
                        WHEN (total_runs_completed + total_runs_failed + 1) < 5
                        THEN reputation_score
                        ELSE LEAST(100, GREATEST(0,
                            (total_runs_completed::numeric /
                             (total_runs_completed + total_runs_failed + 1)::numeric) * 100
                        ))
                    END,
                    updated_at = NOW()
                WHERE id = $1
                "#
            }
        };
        let _ = sqlx::query(sql).bind(agent_id).execute(&db).await;
    });
}

fn error_code_and_message(e: &DaemonError) -> (&'static str, &'static str) {
    match e {
        DaemonError::QuotaExceeded { .. } => ("quota_exceeded", "Monthly quota exceeded"),
        DaemonError::AgentNotFound { .. } => ("agent_not_found", "Agent not found"),
        DaemonError::PermissionDenied { .. } => {
            ("permission_denied", "Missing required permission")
        }
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
