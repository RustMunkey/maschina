// maschina-node — compute node binary for the Maschina distributed network.
//
// Lifecycle:
//   1. Load/generate Ed25519 keypair from disk (~/.config/maschina-node/identity.toml)
//   2. Register with the API (idempotent — skipped if node_id already persisted)
//   3. Submit public key to the API
//   4. Start heartbeat loop (reports load, cpu/ram to API every N seconds)
//   5. Start task executor (NATS subscriber — receives jobs, runs via local runtime, replies)
//   6. Run until SIGTERM/SIGINT

mod api;
mod config;
mod executor;
mod heartbeat;
mod identity;

use std::sync::Arc;
use tokio::signal;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::info;

use api::{ApiClient, NodeCapabilities, RegisterNodeRequest};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = config::Config::from_env()?;

    if cfg.is_production() {
        tracing_subscriber::fmt().json().init();
    } else {
        tracing_subscriber::fmt().pretty().init();
    }

    info!(env = %cfg.env, name = %cfg.node_name, "maschina-node starting");

    // ── Identity ──────────────────────────────────────────────────────────────

    let mut identity = identity::NodeIdentity::load_or_create(&cfg.config_dir)?;
    info!(public_key = %identity.public_key_hex, "Node identity loaded");

    let api = Arc::new(ApiClient::new(cfg.api_url.clone(), cfg.api_key.clone()));

    // ── Registration (idempotent) ─────────────────────────────────────────────

    let node_id = match identity.node_id {
        Some(id) => {
            info!(node_id = %id, "Using existing node registration");
            id
        }
        None => {
            info!("No node ID found — registering with API");
            let req = RegisterNodeRequest {
                name: cfg.node_name.clone(),
                internal_url: cfg.internal_url.clone(),
                region: cfg.region.clone(),
                capabilities: NodeCapabilities {
                    max_concurrent_tasks: cfg.max_concurrent_tasks,
                    supported_models: vec![],
                },
            };
            let id = api.register_node(&req).await?;
            identity.set_node_id(id)?;
            info!(node_id = %id, "Node registered successfully");
            id
        }
    };

    // ── Public key submission ─────────────────────────────────────────────────

    api.submit_public_key(node_id, &identity.public_key_hex)
        .await?;
    info!(node_id = %node_id, "Public key submitted");

    // ── Shutdown coordination ─────────────────────────────────────────────────

    let shutdown = CancellationToken::new();
    let shutdown_tx = shutdown.clone();

    tokio::spawn(async move {
        let ctrl_c = signal::ctrl_c();
        #[cfg(unix)]
        let mut sigterm = signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to register SIGTERM");

        #[cfg(unix)]
        tokio::select! {
            _ = ctrl_c => {},
            _ = sigterm.recv() => {},
        }

        #[cfg(not(unix))]
        ctrl_c.await.ok();

        info!("Shutdown signal received");
        shutdown_tx.cancel();
    });

    // ── Shared state ──────────────────────────────────────────────────────────

    let active_tasks: heartbeat::ActiveTaskCounter = Arc::new(Mutex::new(0));

    // ── Heartbeat ─────────────────────────────────────────────────────────────

    heartbeat::send_once(&api, node_id, 0, "online").await;

    let heartbeat_handle = tokio::spawn(heartbeat::run(
        api.clone(),
        node_id,
        cfg.heartbeat_interval_secs,
        active_tasks.clone(),
        shutdown.clone(),
    ));

    // ── Task executor (NATS) ──────────────────────────────────────────────────

    let executor_handle = tokio::spawn(executor::run(
        cfg.nats_url.clone(),
        cfg.nats_creds.clone(),
        cfg.nats_ca_cert.clone(),
        node_id,
        cfg.runtime_url.clone(),
        cfg.max_concurrent_tasks,
        active_tasks.clone(),
        shutdown.clone(),
    ));

    info!(
        node_id = %node_id,
        nats_url = %cfg.nats_url,
        runtime_url = %cfg.runtime_url,
        max_concurrent = cfg.max_concurrent_tasks,
        "maschina-node online — accepting tasks"
    );

    // Wait for both to finish (they stop on shutdown signal)
    let (_hb, ex) = tokio::join!(heartbeat_handle, executor_handle);
    if let Ok(Err(e)) = ex {
        tracing::error!(error = %e, "Executor task failed");
    }

    info!("maschina-node stopped cleanly");
    Ok(())
}
