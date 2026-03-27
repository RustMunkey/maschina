use anyhow::{bail, Result};
use reqwest::{Client, RequestBuilder, Response};
use serde::{de::DeserializeOwned, Serialize};

use crate::config::Config;

pub struct ApiClient {
    inner: Client,
    /// Separate client without a timeout — used for long-lived SSE connections.
    inner_stream: Client,
    base: String,
    api_key: String,
}

impl ApiClient {
    pub fn new(config: &Config) -> Result<Self> {
        let api_key = config
            .api_key
            .clone()
            .filter(|k| !k.is_empty())
            .ok_or_else(|| {
                anyhow::anyhow!("not authenticated — run `maschina setup` to get started")
            })?;

        let inner = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
            .build()?;

        let inner_stream = Client::builder()
            .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
            .build()?;

        Ok(Self {
            inner,
            inner_stream,
            base: config.api_url.trim_end_matches('/').to_string(),
            api_key,
        })
    }

    fn auth(&self, rb: RequestBuilder) -> RequestBuilder {
        rb.header("Authorization", format!("Bearer {}", self.api_key))
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        parse(self.auth(self.inner.get(self.url(path))).send().await?).await
    }

    pub async fn post<B: Serialize, T: DeserializeOwned>(&self, path: &str, body: &B) -> Result<T> {
        parse(
            self.auth(self.inner.post(self.url(path)))
                .json(body)
                .send()
                .await?,
        )
        .await
    }

    pub async fn patch<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        parse(
            self.auth(self.inner.patch(self.url(path)))
                .json(body)
                .send()
                .await?,
        )
        .await
    }

    pub async fn delete<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        parse(self.auth(self.inner.delete(self.url(path))).send().await?).await
    }

    /// Open a streaming GET (SSE). Returns the raw response — caller streams bytes.
    pub async fn get_sse(&self, path: &str) -> Result<Response> {
        let resp = self
            .auth(self.inner_stream.get(self.url(path)))
            .header("Accept", "text/event-stream")
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            let msg = serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|v| {
                    v.get("message")
                        .or_else(|| v.get("error"))
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| format!("HTTP {}: {}", status.as_u16(), body));
            bail!("{msg}");
        }

        Ok(resp)
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base, path)
    }
}

async fn parse<T: DeserializeOwned>(resp: Response) -> Result<T> {
    let status = resp.status();
    let body = resp.text().await?;

    if !status.is_success() {
        if status.as_u16() == 401 {
            bail!("authentication failed — run `maschina login` to re-authenticate");
        }
        let msg = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| {
                v.get("message")
                    .or_else(|| v.get("error"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("HTTP {}: {}", status.as_u16(), body));
        bail!("{msg}");
    }

    // Handle empty 200/204 responses
    if body.is_empty() || body == "null" {
        return serde_json::from_str("null")
            .or_else(|_| serde_json::from_str("{}"))
            .map_err(|e| anyhow::anyhow!("empty response: {e}"));
    }

    serde_json::from_str(&body).map_err(|e| {
        anyhow::anyhow!(
            "failed to parse response: {}\nbody: {}",
            e,
            &body[..body.len().min(200)]
        )
    })
}
