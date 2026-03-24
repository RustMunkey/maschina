// maschina-daemon — agent orchestration service
// SCAN → EVALUATE → EXECUTE → ANALYZE

mod chain;
mod config;
mod db;
mod error;
mod orchestrator;
mod receipt;
mod runtime;
mod scheduler;
mod server;
mod state;
mod watchdog;

use std::sync::Arc;
use tokio::signal;
use tokio_util::sync::CancellationToken;
use tracing::info;

async fn nats_connect(url: &str) -> anyhow::Result<async_nats::Client> {
    let mut opts = async_nats::ConnectOptions::new();

    // Synadia/NGS credentials
    if let Ok(creds) = std::env::var("NATS_CREDS") {
        let path = std::env::temp_dir().join("nats-daemon.creds");
        std::fs::write(&path, creds.as_bytes())?;
        opts = async_nats::ConnectOptions::with_credentials_file(path.clone()).await?;
        let _ = std::fs::remove_file(path);
    } else if let Ok(path) = std::env::var("NATS_CREDS_FILE") {
        opts = async_nats::ConnectOptions::with_credentials_file(path).await?;
    }

    // TLS: add custom CA cert for self-signed setups (NATS_CA_CERT=/path/to/ca.pem)
    // Also auto-enables when URL starts with tls://
    if let Ok(ca_path) = std::env::var("NATS_CA_CERT") {
        opts = opts.add_root_certificates(ca_path.into());
        opts = opts.require_tls(true);
    } else if url.starts_with("tls://") {
        opts = opts.require_tls(true);
    }

    // Disable the 10-second default request timeout so NATS request-reply waits
    // the full per-run timeout (set via tokio::time::timeout in dispatch_nats).
    Ok(opts.request_timeout(None).connect(url).await?)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Structured logging — JSON in production, pretty in dev
    let config = config::Config::from_env()?;

    if config.is_production() {
        tracing_subscriber::fmt().json().init();
    } else {
        tracing_subscriber::fmt().pretty().init();
    }

    info!(env = %config.env, "maschina-daemon starting");

    // --- Infrastructure connections ---
    let db = db::connect(&config.database_url).await?;

    let redis = redis::Client::open(config.redis_url.as_str())?;
    let redis_mgr = redis::aio::ConnectionManager::new(redis).await?;
    info!("Redis connected");

    let nats = nats_connect(&config.nats_url).await?;
    let jetstream = async_nats::jetstream::new(nats.clone());
    info!("NATS connected");

    // --- Build shared state ---
    let slots = Arc::new(tokio::sync::Semaphore::new(config.max_concurrent_agents));
    let metrics = Arc::new(state::Metrics::new()?);

    let app_state = state::AppState {
        config: Arc::new(config),
        db,
        redis: redis_mgr,
        nats,
        jetstream,
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()?,
        slots,
        metrics,
    };

    // --- Shutdown coordination ---
    let shutdown = CancellationToken::new();

    // Spawn signal handler
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

        info!("Shutdown signal received — initiating graceful shutdown");
        shutdown_tx.cancel();
    });

    // --- Launch services concurrently ---
    let orchestrator = tokio::spawn(orchestrator::run(app_state.clone(), shutdown.clone()));
    let health_server = tokio::spawn(server::serve(app_state.clone(), shutdown.clone()));
    let watchdog = tokio::spawn(watchdog::run(app_state.clone(), shutdown.clone()));

    // Wait for all to finish
    let (orch_res, srv_res, _) = tokio::join!(orchestrator, health_server, watchdog);
    orch_res?;
    srv_res?;

    info!("maschina-daemon stopped cleanly");
    Ok(())
}
