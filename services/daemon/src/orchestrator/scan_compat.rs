use uuid::Uuid;

/// Unified run descriptor passed through EVALUATE → EXECUTE → ANALYZE.
/// Previously sourced from PostgreSQL SKIP LOCKED query; now from NATS job payload.
#[derive(Debug, Clone)]
pub struct JobToRun {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub user_id: Uuid,
    pub plan_tier: String,
    /// Resolved model ID (e.g. "claude-haiku-4-5-20251001" or "ollama/llama3.2").
    pub model: String,
    /// System prompt resolved from agent config at dispatch time.
    pub system_prompt: String,
    pub input_payload: serde_json::Value,
    pub timeout_secs: i64,
    /// Enabled skill slugs for this agent (e.g. ["web_search", "code_exec"]).
    pub skills: Vec<String>,
    /// Per-skill config JSON, keyed by slug.
    pub skill_configs: serde_json::Value,
}
