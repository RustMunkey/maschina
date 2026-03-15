//! Typed wrappers around the Maschina API endpoints used by the node.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub struct ApiClient {
    http: reqwest::Client,
    base_url: String,
    api_key: String,
}

// ─── Registration ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterNodeRequest {
    pub name: String,
    pub internal_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    pub capabilities: NodeCapabilities,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeCapabilities {
    pub max_concurrent_tasks: u32,
    pub supported_models: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterNodeResponse {
    pub id: Uuid,
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatRequest {
    pub active_task_count: u32,
    pub health_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_usage_pct: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ram_usage_pct: Option<f32>,
}

impl ApiClient {
    pub fn new(base_url: String, api_key: String) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("Failed to build HTTP client"),
            base_url,
            api_key,
        }
    }

    fn auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        req.header("Authorization", format!("Bearer {}", self.api_key))
    }

    /// Register this node with the API. Returns the assigned node ID.
    pub async fn register_node(&self, req: &RegisterNodeRequest) -> Result<Uuid> {
        let res = self
            .auth(self.http.post(format!("{}/nodes/register", self.base_url)))
            .json(req)
            .send()
            .await
            .context("Failed to send register request")?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("Node registration failed ({status}): {body}");
        }

        let body: RegisterNodeResponse = res
            .json()
            .await
            .context("Failed to parse registration response")?;
        Ok(body.id)
    }

    /// Submit the node's Ed25519 public key to the API.
    pub async fn submit_public_key(&self, node_id: Uuid, public_key_hex: &str) -> Result<()> {
        let res = self
            .auth(
                self.http
                    .post(format!("{}/nodes/{node_id}/public-key", self.base_url)),
            )
            .json(&serde_json::json!({ "publicKey": public_key_hex }))
            .send()
            .await
            .context("Failed to submit public key")?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("Public key submission failed ({status}): {body}");
        }

        Ok(())
    }

    /// Send a heartbeat. Returns Ok(()) on success.
    pub async fn heartbeat(&self, node_id: Uuid, req: &HeartbeatRequest) -> Result<()> {
        let res = self
            .auth(
                self.http
                    .post(format!("{}/nodes/{node_id}/heartbeat", self.base_url)),
            )
            .json(req)
            .send()
            .await
            .context("Failed to send heartbeat")?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("Heartbeat failed ({status}): {body}");
        }

        Ok(())
    }
}
