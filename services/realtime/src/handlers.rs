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
use serde_json::{json, Value};
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

pub async fn health(State(state): State<AppState>) -> impl IntoResponse {
    use async_nats::connection::State as NatsState;
    use axum::http::StatusCode;

    let nats_ok = matches!(state.nats.connection_state(), NatsState::Connected);
    let status_code = if nats_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        Json(json!({
            "status": if nats_ok { "ok" } else { "degraded" },
            "service": "maschina-realtime",
            "checks": {
                "nats": if nats_ok { "ok" } else { "error" },
            },
            "connections": state.registry.len(),
            "env": state.config.node_env,
        })),
    )
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
                        if socket.send(Message::Text(text)).await.is_err() {
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

// ─── POST /internal/run-event ─────────────────────────────────────────────────
// Called by the daemon ANALYZE phase (and streaming forwarder) to push run
// status events and streaming chunks to connected clients.
//
// Payload must include `userId` — used to route the event to the right
// broadcast channel. The full payload is forwarded as-is to the client.
//
// No auth on this endpoint — it's internal-only, not exposed via the gateway.
// Protected by network policy in production (daemon → realtime on private net).

pub async fn run_event_handler(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let user_id = payload.get("userId").and_then(|v| v.as_str()).unwrap_or("");

    if user_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "userId is required"})),
        )
            .into_response();
    }

    let text = match serde_json::to_string(&payload) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "Failed to serialise run event");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // Publish to the user's broadcast channel.
    // If nobody is subscribed yet the send will fail silently — that's fine.
    registry::send_to_user(&state.registry, user_id, text);

    StatusCode::OK.into_response()
}
