// maschina-daemon — agent orchestration service
// SCAN → EVALUATE → EXECUTE → ANALYZE

mod config;
mod db;
mod error;
mod orchestrator;
mod runtime;
mod server;
mod state;

use std::sync::Arc;
use tokio::signal;
use tokio_util::sync::CancellationToken;
use tracing::info;

async fn nats_connect(url: &str) -> anyhow::Result<async_nats::Client> {
    // Support Synadia/NGS: set NATS_CREDS to the raw content of your .creds file.
    // fly secrets set NATS_CREDS="$(cat /path/to/NGS-Default-CLI.creds)"
    if let Ok(creds) = std::env::var("NATS_CREDS") {
        let path = std::env::temp_dir().join("nats.creds");
        std::fs::write(&path, creds.as_bytes())?;
        let client = async_nats::ConnectOptions::with_credentials_file(path.clone())
            .await?
            .connect(url)
            .await?;
        let _ = std::fs::remove_file(path);
        return Ok(client);
    }
    if let Ok(path) = std::env::var("NATS_CREDS_FILE") {
        return Ok(async_nats::ConnectOptions::with_credentials_file(path)
            .await?
            .connect(url)
            .await?);
    }
    Ok(async_nats::connect(url).await?)
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

    // Wait for both to finish (orchestrator drains, server closes)
    let (orch_res, srv_res) = tokio::join!(orchestrator, health_server);
    orch_res?;
    srv_res?;

    info!("maschina-daemon stopped cleanly");
    Ok(())
}
