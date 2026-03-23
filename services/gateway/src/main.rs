mod auth;
mod config;
mod error;
mod middleware;
mod proxy;
mod routes;
mod state;

use std::net::SocketAddr;

use axum::{
    middleware as axum_middleware,
    routing::{any, get},
    Router,
};
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};

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
    let is_prod = config.is_production();

    let state = state::AppState::new(config);

    // CORS — restrict origins in production via environment if needed;
    // for now allow any origin since gateway sits behind TLS termination.
    let cors = if is_prod {
        CorsLayer::permissive()
    } else {
        CorsLayer::very_permissive()
    };

    let app = Router::new()
        // Internal health — not rate-limited, not proxied
        .route("/health", get(routes::health))
        // WebSocket upgrade → realtime service
        .route("/ws", any(proxy::proxy_ws))
        .route("/ws/*path", any(proxy::proxy_ws))
        // SSE + all other HTTP → API service (or realtime for /events/*)
        .route("/", any(proxy::proxy_http))
        .route("/*path", any(proxy::proxy_http))
        // Auth + rate-limit on every request
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::auth_and_rate_limit,
        ))
        // Enforce HTTPS in production (X-Forwarded-Proto validation)
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::enforce_https,
        ))
        // Security headers on every response
        .layer(axum_middleware::from_fn(middleware::security_headers))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(port = port, "maschina gateway listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
