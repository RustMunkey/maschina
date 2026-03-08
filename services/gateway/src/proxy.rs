use axum::{
    body::Body,
    extract::{ws::WebSocket, State, WebSocketUpgrade},
    http::{Request, Response, StatusCode},
    response::IntoResponse,
};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message as TungsteniteMsg;

use crate::{config::Config, error::GatewayError, state::AppState};

// ─── URL helpers ──────────────────────────────────────────────────────────────

fn http_upstream(config: &Config, path: &str, query: Option<&str>) -> String {
    let base = if is_realtime_path(path) {
        &config.realtime_url
    } else {
        &config.api_url
    };
    match query {
        Some(q) if !q.is_empty() => format!("{base}{path}?{q}"),
        _ => format!("{base}{path}"),
    }
}

fn is_realtime_path(path: &str) -> bool {
    path.starts_with("/ws") || path.starts_with("/events")
}

// ─── HTTP proxy ───────────────────────────────────────────────────────────────

const MAX_REQUEST_BODY: usize = 16 * 1024 * 1024; // 16 MiB

/// Proxy a plain HTTP request to the appropriate upstream service.
///
/// SSE (`/events/*`) and regular REST (`/*`) are both handled here.
/// The response body is streamed so SSE works without buffering.
pub async fn proxy_http(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Result<impl IntoResponse, GatewayError> {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let headers = req.headers().clone();
    let path = uri.path();
    let query = uri.query();

    let upstream = http_upstream(&state.config, path, query);

    // Build reqwest request
    let rmethod = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .map_err(|_| GatewayError::BadGateway("invalid method".into()))?;
    let mut builder = state.http.request(rmethod, &upstream);

    // Forward headers, stripping hop-by-hop
    for (name, value) in headers.iter() {
        if is_hop_by_hop(name.as_str()) {
            continue;
        }
        builder = builder.header(name.as_str(), value.as_bytes());
    }

    // Read request body
    let body_bytes: Bytes = axum::body::to_bytes(req.into_body(), MAX_REQUEST_BODY)
        .await
        .map_err(|_| GatewayError::BadGateway("failed to read request body".into()))?;

    if !body_bytes.is_empty() {
        builder = builder.body(body_bytes);
    }

    // Execute
    let upstream_resp = builder.send().await.map_err(|e| {
        tracing::error!(error = %e, upstream = %upstream, "upstream request failed");
        GatewayError::BadGateway(e.to_string())
    })?;

    // Build axum response
    let status = StatusCode::from_u16(upstream_resp.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let mut resp_builder = Response::builder().status(status);

    for (name, value) in upstream_resp.headers() {
        if is_hop_by_hop(name.as_str()) {
            continue;
        }
        resp_builder = resp_builder.header(name.as_str(), value.as_bytes());
    }

    // Stream the body so SSE / chunked responses work
    let body_stream = upstream_resp.bytes_stream();
    let body = Body::from_stream(body_stream);

    resp_builder
        .body(body)
        .map_err(|e| GatewayError::BadGateway(e.to_string()))
}

fn is_hop_by_hop(name: &str) -> bool {
    matches!(
        name.to_lowercase().as_str(),
        "host"
            | "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "proxy-connection"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

// ─── WebSocket proxy ──────────────────────────────────────────────────────────

/// Upgrade the client connection to WebSocket, then bridge to the realtime service.
pub async fn proxy_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    req: Request<Body>,
) -> impl IntoResponse {
    let uri = req.uri().clone();
    let headers = req.headers().clone();
    let realtime_url = state.config.realtime_url.clone();

    ws.on_upgrade(move |client_socket| async move {
        let path = uri.path();
        let query = uri.query();
        let upstream_url = {
            let base = realtime_url
                .replace("https://", "wss://")
                .replace("http://", "ws://");
            match query {
                Some(q) if !q.is_empty() => format!("{base}{path}?{q}"),
                _ => format!("{base}{path}"),
            }
        };

        // Build upstream WS request, forwarding auth headers set by middleware
        let mut req_builder =
            tokio_tungstenite::tungstenite::http::Request::builder().uri(&upstream_url);

        for (name, value) in headers.iter() {
            let n = name.as_str().to_lowercase();
            // Skip WS handshake headers — tungstenite adds its own
            if matches!(
                n.as_str(),
                "host"
                    | "connection"
                    | "upgrade"
                    | "sec-websocket-key"
                    | "sec-websocket-version"
                    | "sec-websocket-extensions"
                    | "sec-websocket-protocol"
            ) {
                continue;
            }
            if let Ok(v) = std::str::from_utf8(value.as_bytes()) {
                req_builder = req_builder.header(name.as_str(), v);
            }
        }

        let ws_req = match req_builder.body(()) {
            Ok(r) => r,
            Err(e) => {
                tracing::error!(error = %e, "failed to build ws upstream request");
                return;
            }
        };

        match tokio_tungstenite::connect_async(ws_req).await {
            Ok((upstream_socket, _)) => bridge_ws(client_socket, upstream_socket).await,
            Err(e) => {
                tracing::error!(error = %e, upstream = %upstream_url, "ws upstream connect failed");
            }
        }
    })
}

/// Bidirectionally forward WebSocket frames between client and upstream.
async fn bridge_ws(
    client: WebSocket,
    upstream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) {
    use axum::extract::ws::Message as AxumMsg;

    let (mut client_tx, mut client_rx) = client.split();
    let (mut upstream_tx, mut upstream_rx) = upstream.split();

    let client_to_upstream = async {
        while let Some(Ok(msg)) = client_rx.next().await {
            let fwd = match msg {
                AxumMsg::Text(t) => TungsteniteMsg::Text(t.into()),
                AxumMsg::Binary(b) => TungsteniteMsg::Binary(b.into()),
                AxumMsg::Ping(p) => TungsteniteMsg::Ping(p.into()),
                AxumMsg::Pong(p) => TungsteniteMsg::Pong(p.into()),
                AxumMsg::Close(_) => break,
            };
            if upstream_tx.send(fwd).await.is_err() {
                break;
            }
        }
    };

    let upstream_to_client = async {
        while let Some(Ok(msg)) = upstream_rx.next().await {
            let fwd = match msg {
                TungsteniteMsg::Text(t) => AxumMsg::Text(t.into()),
                TungsteniteMsg::Binary(b) => AxumMsg::Binary(b.into()),
                TungsteniteMsg::Ping(p) => AxumMsg::Ping(p.into()),
                TungsteniteMsg::Pong(p) => AxumMsg::Pong(p.into()),
                TungsteniteMsg::Close(_) | TungsteniteMsg::Frame(_) => break,
            };
            if client_tx.send(fwd).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = client_to_upstream => {}
        _ = upstream_to_client => {}
    }
}
