use reqwest::{Client, RequestBuilder, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use uuid::Uuid;

use crate::{
    error::MaschinaError,
    types::{
        Agent, AgentRun, ApiKey, CreateAgentInput, CreateKeyInput, CreateKeyResponse,
        RunAgentInput, Subscription, UpdateAgentInput, UsageSummary,
    },
};

const DEFAULT_BASE_URL: &str = "https://api.maschina.ai";

pub struct MaschinaClient {
    api_key: String,
    base_url: String,
    http: Client,
}

impl MaschinaClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self::with_base_url(api_key, DEFAULT_BASE_URL)
    }

    pub fn with_base_url(api_key: impl Into<String>, base_url: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            base_url: base_url.into().trim_end_matches('/').to_string(),
            http: Client::new(),
        }
    }

    // ── Agents ─────────────────────────────────────────────────────────────

    pub async fn list_agents(&self) -> Result<Vec<Agent>, MaschinaError> {
        self.get("/agents").await
    }

    pub async fn get_agent(&self, id: Uuid) -> Result<Agent, MaschinaError> {
        self.get(&format!("/agents/{id}")).await
    }

    pub async fn create_agent(&self, input: &CreateAgentInput) -> Result<Agent, MaschinaError> {
        self.post("/agents", input).await
    }

    pub async fn update_agent(
        &self,
        id: Uuid,
        input: &UpdateAgentInput,
    ) -> Result<Agent, MaschinaError> {
        self.patch(&format!("/agents/{id}"), input).await
    }

    pub async fn delete_agent(&self, id: Uuid) -> Result<(), MaschinaError> {
        self.delete(&format!("/agents/{id}")).await
    }

    pub async fn run_agent(
        &self,
        id: Uuid,
        input: &RunAgentInput,
    ) -> Result<AgentRun, MaschinaError> {
        self.post(&format!("/agents/{id}/run"), input).await
    }

    pub async fn list_agent_runs(&self, id: Uuid) -> Result<Vec<AgentRun>, MaschinaError> {
        self.get(&format!("/agents/{id}/runs")).await
    }

    // ── API Keys ────────────────────────────────────────────────────────────

    pub async fn list_keys(&self) -> Result<Vec<ApiKey>, MaschinaError> {
        self.get("/keys").await
    }

    pub async fn create_key(
        &self,
        input: &CreateKeyInput,
    ) -> Result<CreateKeyResponse, MaschinaError> {
        self.post("/keys", input).await
    }

    pub async fn revoke_key(&self, id: Uuid) -> Result<(), MaschinaError> {
        self.delete(&format!("/keys/{id}")).await
    }

    // ── Usage & Billing ─────────────────────────────────────────────────────

    pub async fn get_usage(&self) -> Result<UsageSummary, MaschinaError> {
        self.get("/usage/summary").await
    }

    pub async fn get_subscription(&self) -> Result<Option<Subscription>, MaschinaError> {
        self.get("/billing/subscription").await
    }

    // ── HTTP helpers ────────────────────────────────────────────────────────

    fn auth(&self, req: RequestBuilder) -> RequestBuilder {
        req.header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
    }

    async fn send<T: DeserializeOwned>(&self, req: RequestBuilder) -> Result<T, MaschinaError> {
        let res = req
            .send()
            .await
            .map_err(|e| MaschinaError::Network(e.to_string()))?;

        let status = res.status();

        if status == StatusCode::NO_CONTENT {
            // SAFETY: T must be () for 204 responses
            return serde_json::from_value(serde_json::Value::Null)
                .map_err(|e| MaschinaError::Internal(e.to_string()));
        }

        let body: serde_json::Value = res
            .json()
            .await
            .map_err(|e| MaschinaError::Internal(e.to_string()))?;

        if !status.is_success() {
            let message = body
                .pointer("/error/message")
                .or_else(|| body.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown error")
                .to_string();
            let code = body
                .pointer("/error/code")
                .or_else(|| body.get("code"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            return Err(MaschinaError::Api {
                status: status.as_u16(),
                message,
                code,
            });
        }

        serde_json::from_value(body).map_err(|e| MaschinaError::Internal(e.to_string()))
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, MaschinaError> {
        let req = self.auth(self.http.get(format!("{}{}", self.base_url, path)));
        self.send(req).await
    }

    async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, MaschinaError> {
        let req = self
            .auth(self.http.post(format!("{}{}", self.base_url, path)))
            .json(body);
        self.send(req).await
    }

    async fn patch<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, MaschinaError> {
        let req = self
            .auth(self.http.patch(format!("{}{}", self.base_url, path)))
            .json(body);
        self.send(req).await
    }

    async fn delete<T: DeserializeOwned>(&self, path: &str) -> Result<T, MaschinaError> {
        let req = self.auth(self.http.delete(format!("{}{}", self.base_url, path)));
        self.send(req).await
    }
}
