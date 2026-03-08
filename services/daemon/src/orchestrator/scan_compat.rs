use uuid::Uuid;

/// Unified run descriptor passed through EVALUATE → EXECUTE → ANALYZE.
/// Previously sourced from PostgreSQL SKIP LOCKED query; now from NATS job payload.
#[derive(Debug, Clone)]
pub struct JobToRun {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub user_id: Uuid,
    pub plan_tier: String,
    pub input_payload: serde_json::Value,
    pub timeout_secs: i64,
}
