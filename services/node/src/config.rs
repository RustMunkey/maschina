//! Node configuration — loaded from environment variables + .env file.

use anyhow::{Context, Result};
use std::{env, path::PathBuf};

#[derive(Debug, Clone)]
pub struct Config {
    /// Maschina API base URL (e.g. https://api.maschina.ai)
    pub api_url: String,
    /// JWT or API key for authenticating with the Maschina API
    pub api_key: String,
    /// Human-readable node name (shown in dashboard)
    pub node_name: String,
    /// Geographic region (e.g. "us-east", "eu-west")
    pub region: Option<String>,
    /// Internal URL this node listens on — reported to API for HTTP dispatch
    pub internal_url: String,
    /// NATS server URL (e.g. nats://localhost:4222)
    pub nats_url: String,
    /// Path to NATS credentials file (NGS / NKey creds). Optional for local dev.
    pub nats_creds: Option<String>,
    /// Path to NATS CA certificate (for self-signed TLS). Optional.
    pub nats_ca_cert: Option<String>,
    /// Local Python runtime URL — where agent execution happens on this machine
    pub runtime_url: String,
    /// Heartbeat interval in seconds
    pub heartbeat_interval_secs: u64,
    /// Max concurrent tasks this node will accept
    pub max_concurrent_tasks: u32,
    /// Directory to store persistent node state (identity keypair, node ID)
    pub config_dir: PathBuf,
    /// Environment: "development" | "production"
    pub env: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let _ = dotenvy::dotenv();

        let config_dir = env::var("NODE_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| dirs_next().join("maschina-node"));

        Ok(Self {
            api_url: env::var("MASCHINA_API_URL")
                .unwrap_or_else(|_| "http://localhost:3000".into()),
            api_key: env::var("MASCHINA_API_KEY").context("MASCHINA_API_KEY is required")?,
            node_name: env::var("NODE_NAME").unwrap_or_else(|_| hostname()),
            region: env::var("NODE_REGION").ok(),
            internal_url: env::var("NODE_INTERNAL_URL")
                .unwrap_or_else(|_| "http://localhost:8002".into()),
            nats_url: env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".into()),
            nats_creds: env::var("NATS_CREDS").ok(),
            nats_ca_cert: env::var("NATS_CA_CERT").ok(),
            runtime_url: env::var("RUNTIME_URL").unwrap_or_else(|_| "http://localhost:8001".into()),
            heartbeat_interval_secs: env::var("NODE_HEARTBEAT_INTERVAL_SECS")
                .unwrap_or_else(|_| "30".into())
                .parse()
                .context("NODE_HEARTBEAT_INTERVAL_SECS must be a number")?,
            max_concurrent_tasks: env::var("NODE_MAX_CONCURRENT_TASKS")
                .unwrap_or_else(|_| "2".into())
                .parse()
                .context("NODE_MAX_CONCURRENT_TASKS must be a number")?,
            config_dir,
            env: env::var("NODE_ENV").unwrap_or_else(|_| "development".into()),
        })
    }

    pub fn is_production(&self) -> bool {
        self.env == "production"
    }
}

fn dirs_next() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        let home = env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
    }
    #[cfg(not(target_os = "macos"))]
    {
        let home = env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        PathBuf::from(home).join(".config")
    }
}

fn hostname() -> String {
    std::fs::read_to_string("/etc/hostname")
        .unwrap_or_else(|_| "maschina-node".into())
        .trim()
        .to_string()
}
