use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type AgentId = Uuid;
pub type UserId = Uuid;
pub type OrgId = Uuid;

// ── Enums ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Signal,
    Analysis,
    Execution,
    Optimization,
    Reporting,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Scanning,
    Evaluating,
    Executing,
    Analyzing,
    Scaling,
    Error,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Queued,
    Executing,
    Completed,
    Failed,
    Timeout,
    Canceled,
}

// ── Agent ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: AgentId,
    pub name: String,
    pub description: Option<String>,
    pub agent_type: AgentType,
    pub model: String,
    pub system_prompt: String,
    pub status: AgentStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentInput {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub agent_type: AgentType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
}

// ── Agent Run ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: Uuid,
    pub agent_id: AgentId,
    pub status: RunStatus,
    pub input_payload: serde_json::Value,
    pub output_payload: Option<serde_json::Value>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub duration_ms: Option<i64>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunAgentInput {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
}

// ── API Keys ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKey {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKeyInput {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKeyResponse {
    #[serde(flatten)]
    pub key: ApiKey,
    pub raw_key: String,
}

// ── Billing ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub id: String,
    pub tier: String,
    pub status: String,
    pub current_period_end: DateTime<Utc>,
    pub cancel_at_period_end: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSummary {
    pub tier: String,
    pub period: String,
    pub quotas: serde_json::Value,
}
