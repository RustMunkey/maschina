use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde_json::json;
use std::time::Duration;

use crate::state::AppState;

pub async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let api_ok = state
        .http
        .get(format!("{}/health", state.config.api_url))
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    let realtime_ok = state
        .http
        .get(format!("{}/health", state.config.realtime_url))
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    let healthy = api_ok && realtime_ok;
    let status_code = if healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        Json(json!({
            "status": if healthy { "ok" } else { "degraded" },
            "service": "maschina-gateway",
            "checks": {
                "api": if api_ok { "ok" } else { "error" },
                "realtime": if realtime_ok { "ok" } else { "error" },
            },
        })),
    )
}
