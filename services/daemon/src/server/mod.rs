use crate::state::AppState;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use prometheus::Encoder;
use std::net::SocketAddr;
use tokio_util::sync::CancellationToken;
use tracing::info;

/// Start the internal health + metrics HTTP server.
/// Runs until the cancellation token fires.
pub async fn serve(state: AppState, shutdown: CancellationToken) {
    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics))
        .with_state(state.clone());

    let addr = SocketAddr::from(([0, 0, 0, 0], state.config.health_port));
    info!(port = state.config.health_port, "Health server listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind health server port");

    axum::serve(listener, app)
        .with_graceful_shutdown(async move { shutdown.cancelled().await })
        .await
        .expect("Health server error");
}

async fn health(State(state): State<AppState>) -> Response {
    // Quick liveness probe — just check DB connectivity
    match sqlx::query("SELECT 1").execute(&state.db).await {
        Ok(_) => (StatusCode::OK, "ok").into_response(),
        Err(e) => (StatusCode::SERVICE_UNAVAILABLE, format!("db error: {e}")).into_response(),
    }
}

async fn metrics(State(state): State<AppState>) -> Response {
    let encoder = prometheus::TextEncoder::new();
    let metric_families = state.metrics.registry.gather();
    let mut buffer = Vec::new();

    if let Err(e) = encoder.encode(&metric_families, &mut buffer) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("encode error: {e}"),
        )
            .into_response();
    }

    let body = String::from_utf8(buffer).unwrap_or_default();
    (
        StatusCode::OK,
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4",
        )],
        body,
    )
        .into_response()
}
