use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum DaemonError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Runtime error: {0}")]
    Runtime(String),

    #[error("Agent run {run_id} timed out after {timeout_secs}s")]
    Timeout { run_id: Uuid, timeout_secs: u64 },

    #[error("Quota exceeded for user {user_id}: {quota_type}")]
    QuotaExceeded { user_id: Uuid, quota_type: String },

    #[error("Agent {agent_id} not found or not accessible")]
    AgentNotFound { agent_id: Uuid },

    #[error("Agent {agent_id} is missing required permission: {permission}")]
    PermissionDenied { agent_id: Uuid, permission: String },

    #[allow(dead_code)]
    #[error("Sandbox error: {0}")]
    Sandbox(String),

    #[error("Config error: {0}")]
    Config(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, DaemonError>;
