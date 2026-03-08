use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    http::{HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json,
    },
};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

use crate::{auth, registry, state::AppState};

// ─── Shared query params ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ConnectParams {
    /// JWT token — used when connecting directly (not via gateway).
    pub token: Option<String>,
}

// ─── Health ───────────────────────────────────────────────────────────────────

pub async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "maschina-realtime",
        "connections": state.registry.len(),
        "env": state.config.node_env,
    }))
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<ConnectParams>,
) -> impl IntoResponse {
    let user_id =
        auth::resolve_user_id(&headers, params.token.as_deref(), &state.config.jwt_secret);

    let Some(user_id) = user_id else {
        return StatusCode::UNAUTHORIZED.into_response();
    };

    ws.on_upgrade(move |socket| async move {
        let rx = registry::subscribe(&state.registry, &user_id);
        tracing::info!(user_id = %user_id, "ws client connected");
        handle_ws(socket, rx, &user_id).await;
        tracing::info!(user_id = %user_id, "ws client disconnected");
    })
}

async fn handle_ws(mut socket: WebSocket, mut rx: broadcast::Receiver<String>, user_id: &str) {
    loop {
        tokio::select! {
            // Incoming message from client (ping/pong/close)
            client_msg = socket.recv() => {
                match client_msg {
                    Some(Ok(Message::Ping(p))) => {
                        if socket.send(Message::Pong(p)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    // Other client-to-server messages ignored (read-only pub channel)
                    _ => {}
                }
            }
            // Event from broadcast registry
            event = rx.recv() => {
                match event {
                    Ok(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                    // Receiver fell behind; skip the lagged messages and continue
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(user_id = %user_id, skipped = n, "ws receiver lagged");
                    }
                }
            }
        }
    }
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

pub async fn sse_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<ConnectParams>,
) -> impl IntoResponse {
    let user_id =
        auth::resolve_user_id(&headers, params.token.as_deref(), &state.config.jwt_secret);

    let Some(user_id) = user_id else {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    };

    let rx = registry::subscribe(&state.registry, &user_id);
    tracing::info!(user_id = %user_id, "sse client connected");

    let stream = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(text) => Some(Ok::<Event, axum::Error>(Event::default().data(text))),
        // Receiver lagged — skip and continue
        Err(_) => None,
    });

    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}
