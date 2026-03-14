use crate::error::{DaemonError, Result};
use crate::orchestrator::scan_compat::JobToRun as QueuedRun;
use crate::runtime::RunOutput;
use crate::state::AppState;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use tracing::warn;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

/// Sign `payload` with HMAC-SHA256 and return the hex digest.
fn sign(payload: &str, secret: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Generate and persist a Proof of Compute receipt for a successful run.
/// Non-fatal — failures are logged but do not affect the run outcome.
pub async fn issue_receipt(state: &AppState, run: &QueuedRun, output: &RunOutput) {
    if let Err(e) = try_issue(state, run, output).await {
        warn!(run_id = %run.id, error = %e, "Failed to issue execution receipt");
    }
}

async fn try_issue(state: &AppState, run: &QueuedRun, output: &RunOutput) -> Result<()> {
    let executed_at = chrono::Utc::now().to_rfc3339();

    // Canonical payload — keys sorted alphabetically for deterministic signing
    let payload = serde_json::json!({
        "agent_id":      run.agent_id,
        "executed_at":   executed_at,
        "input_tokens":  output.input_tokens,
        "model":         run.model,
        "output_tokens": output.output_tokens,
        "run_id":        run.id,
        "user_id":       run.user_id,
    });

    let payload_str = serde_json::to_string(&payload)
        .map_err(|e| DaemonError::Internal(format!("receipt serialization failed: {e}")))?;

    let signature = sign(&payload_str, &state.config.proof_secret);
    let receipt_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO execution_receipts
            (id, run_id, agent_id, user_id, model, input_tokens, output_tokens, payload, signature, issued_at)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        "#,
    )
    .bind(receipt_id)
    .bind(run.id)
    .bind(run.agent_id)
    .bind(run.user_id)
    .bind(&run.model)
    .bind(output.input_tokens as i64)
    .bind(output.output_tokens as i64)
    .bind(&payload)
    .bind(&signature)
    .execute(&state.db)
    .await?;

    Ok(())
}
