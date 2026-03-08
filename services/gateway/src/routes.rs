use axum::{extract::State, Json};
use serde_json::json;

use crate::state::AppState;

pub async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "maschina-gateway",
        "env": state.config.node_env,
    }))
}
