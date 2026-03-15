mod auth;
mod config;
mod handlers;
mod nats;
mod registry;
mod state;

async fn nats_connect(url: &str) -> anyhow::Result<async_nats::Client> {
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

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    routing::{any, get, post},
    Router,
};
use tokio_util::sync::CancellationToken;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .json()
        .init();

    let config = config::Config::from_env()?;
    let port = config.port;

    // NATS connection — supports Synadia/NGS via NATS_CREDS env var
    let nats = nats_connect(&config.nats_url).await?;
    tracing::info!(url = %config.nats_url, "connected to NATS");

    let registry = registry::new_registry();
    let shutdown = CancellationToken::new();

    let state = state::AppState {
        config: Arc::new(config),
        registry,
        nats,
    };

    // Start NATS fan-out background tasks
    let fan_out_state = state.clone();
    let fan_out_shutdown = shutdown.clone();
    let fan_out = tokio::spawn(async move {
        if let Err(e) = nats::start_fan_out(fan_out_state, fan_out_shutdown).await {
            tracing::error!(error = %e, "nats fan-out error");
        }
    });

    // HTTP server
    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/ws", any(handlers::ws_handler))
        .route("/ws/*path", any(handlers::ws_handler))
        .route("/events", get(handlers::sse_handler))
        .route("/events/*path", get(handlers::sse_handler))
        .route("/internal/run-event", post(handlers::run_event_handler))
        .layer(CorsLayer::very_permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(port = port, "maschina realtime listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;

    let serve = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    );

    // Graceful shutdown on Ctrl-C
    tokio::select! {
        result = serve => { result?; }
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutting down");
            shutdown.cancel();
        }
    }

    fan_out.await.ok();
    Ok(())
}
