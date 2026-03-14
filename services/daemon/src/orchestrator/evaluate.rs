use crate::error::DaemonError;
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::state::AppState;
use redis::AsyncCommands;
use tracing::{info, instrument, warn};

#[derive(Debug, sqlx::FromRow)]
struct AgentSkillRow {
    skill_name: String,
    config: serde_json::Value,
    enabled: bool,
}

/// EVALUATE phase: check quota and tier gates before allowing execution.
/// Returns `Ok(())` if the run should proceed, or marks it failed and returns `Err`.
#[instrument(skip(state, run), fields(run_id = %run.id, user_id = %run.user_id))]
pub async fn evaluate_and_execute(state: AppState, mut run: QueuedRun) {
    match evaluate(&state, &mut run).await {
        Ok(()) => {
            super::execute::execute_run(state, run).await;
        }
        Err(e) => {
            warn!(run_id = %run.id, error = %e, "Evaluate phase rejected run");
            let (status, reason) = match &e {
                DaemonError::QuotaExceeded { .. } => ("failed", "quota_exceeded"),
                DaemonError::AgentNotFound { .. } => ("failed", "agent_not_found"),
                _ => ("failed", "evaluate_error"),
            };
            let _ = fail_run(&state, &run, status, reason, &e.to_string()).await;
            state.metrics.runs_executing.dec();
            state.metrics.runs_failed.inc();
        }
    }
}

async fn evaluate(state: &AppState, run: &mut QueuedRun) -> crate::error::Result<()> {
    // 1. Verify the agent still exists and belongs to the user
    let agent_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM agents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
    )
    .bind(run.agent_id)
    .bind(run.user_id)
    .fetch_one(&state.db)
    .await?;

    if !agent_exists {
        return Err(DaemonError::AgentNotFound {
            agent_id: run.agent_id,
        });
    }

    // 2. Resolve enabled skills for this agent
    let skill_rows = sqlx::query_as::<_, AgentSkillRow>(
        "SELECT skill_name, config, enabled FROM agent_skills WHERE agent_id = $1 AND enabled = true",
    )
    .bind(run.agent_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut skill_configs = serde_json::Map::new();
    for row in &skill_rows {
        run.skills.push(row.skill_name.clone());
        skill_configs.insert(row.skill_name.clone(), row.config.clone());
    }
    run.skill_configs = serde_json::Value::Object(skill_configs);

    // 3. Skip quota checks for internal tier
    if run.plan_tier == "internal" {
        info!(run_id = %run.id, "Internal tier — skipping quota check");
        return Ok(());
    }

    // 4. Check monthly agent execution quota via Redis
    let month = chrono::Utc::now().format("%Y-%m").to_string();
    let quota_key = format!("quota:{}:agent_execution:{}", run.user_id, month);

    let current: i64 = state
        .redis
        .clone()
        .get::<_, Option<i64>>(&quota_key)
        .await
        .unwrap_or(None)
        .unwrap_or(0);

    let monthly_limit = monthly_execution_limit(&run.plan_tier);

    if monthly_limit > 0 && current >= monthly_limit {
        return Err(DaemonError::QuotaExceeded {
            user_id: run.user_id,
            quota_type: "agent_execution".into(),
        });
    }

    Ok(())
}

fn monthly_execution_limit(tier: &str) -> i64 {
    match tier {
        "access" => 10,
        "m1" => 500,
        "m5" => 2_000,
        "m10" => 10_000,
        "teams" => 10_000,
        "enterprise" => -1, // unlimited
        "internal" => -1,
        _ => 0,
    }
}

async fn fail_run(
    state: &AppState,
    run: &QueuedRun,
    status: &str,
    reason: &str,
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
    .bind(reason)
    .bind(error_message)
    .bind(run.id)
    .execute(&state.db)
    .await?;

    Ok(())
}
