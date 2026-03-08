use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type AgentId = Uuid;
pub type UserId = Uuid;
pub type OrgId = Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: AgentId,
    pub name: String,
    pub agent_type: AgentType,
    pub status: AgentStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Signal,
    Analysis,
    Execution,
    Optimization,
    Reporting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Scanning,
    Evaluating,
    Executing,
    Analyzing,
    Scaling,
    Error,
}
