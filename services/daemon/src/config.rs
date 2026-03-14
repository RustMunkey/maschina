use anyhow::{Context, Result};
use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    /// PostgreSQL connection URL
    pub database_url: String,
    /// Redis connection URL
    pub redis_url: String,
    /// NATS connection URL
    pub nats_url: String,
    /// URL of the Python runtime service
    pub runtime_url: String,
    /// URL of the realtime service (for pushing agent events)
    pub realtime_url: String,
    /// Max agent runs executing concurrently on this daemon instance
    pub max_concurrent_agents: usize,
    /// How often to poll for queued runs (ms)
    pub poll_interval_ms: u64,
    /// Port for the daemon's internal health/metrics HTTP server
    pub health_port: u16,
    /// Agent run timeout — hard kill after this many seconds
    #[allow(dead_code)]
    pub agent_timeout_secs: u64,
    /// Environment: "development" | "production"
    pub env: String,
    /// Secret used to sign Proof of Compute execution receipts (HMAC-SHA256).
    /// Falls back to a dev default when unset — set PROOF_SECRET in production.
    pub proof_secret: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let _ = dotenvy::dotenv()
            .map(|_| ())
            .or_else(|_| dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/.env")))
            .or_else(|_| dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../../.env")));

        Ok(Self {
            database_url: required("DATABASE_URL")?,
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into()),
            nats_url: env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".into()),
            runtime_url: env::var("RUNTIME_URL").unwrap_or_else(|_| "http://localhost:8001".into()),
            realtime_url: env::var("REALTIME_URL")
                .unwrap_or_else(|_| "http://localhost:4000".into()),
            max_concurrent_agents: env::var("MAX_CONCURRENT_AGENTS")
                .unwrap_or_else(|_| "8".into())
                .parse()
                .context("MAX_CONCURRENT_AGENTS must be a number")?,
            poll_interval_ms: env::var("POLL_INTERVAL_MS")
                .unwrap_or_else(|_| "500".into())
                .parse()
                .context("POLL_INTERVAL_MS must be a number")?,
            health_port: env::var("DAEMON_HEALTH_PORT")
                .unwrap_or_else(|_| "9090".into())
                .parse()
                .context("DAEMON_HEALTH_PORT must be a number")?,
            agent_timeout_secs: env::var("AGENT_TIMEOUT_SECS")
                .unwrap_or_else(|_| "300".into())
                .parse()
                .context("AGENT_TIMEOUT_SECS must be a number")?,
            env: env::var("NODE_ENV").unwrap_or_else(|_| "development".into()),
            proof_secret: env::var("PROOF_SECRET")
                .unwrap_or_else(|_| "dev-proof-secret-change-in-production".into()),
        })
    }

    pub fn is_production(&self) -> bool {
        self.env == "production"
    }
}

fn required(key: &str) -> Result<String> {
    env::var(key).with_context(|| format!("Required environment variable {key} is not set"))
}
