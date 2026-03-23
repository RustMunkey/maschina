use std::net::SocketAddr;

use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};

use crate::{
    auth::{extract_auth, AuthContext},
    error::GatewayError,
    state::AppState,
};

/// Combined auth + rate-limit middleware.
///
/// - Valid JWT   → injects `x-forwarded-user-id` + `x-forwarded-plan-tier`, per-user limit.
/// - API key     → injects `x-forwarded-api-key`, per-IP limit (API service validates the key).
/// - No auth     → per-IP limit only; public/protected distinction handled by API service.
///
/// All requests get a `x-request-id` header for correlation.
pub async fn auth_and_rate_limit(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    mut req: Request,
    next: Next,
) -> Result<Response, GatewayError> {
    let auth = extract_auth(req.headers(), &state.config.jwt_secret);

    match &auth {
        AuthContext::Jwt(claims) => {
            if state.user_limiter.check_key(&claims.sub).is_err() {
                return Err(GatewayError::RateLimited);
            }
            let headers = req.headers_mut();
            headers.insert("x-forwarded-user-id", hval(&claims.sub)?);
            headers.insert("x-forwarded-plan-tier", hval(&claims.tier)?);
        }
        AuthContext::ApiKey(key) => {
            if state.ip_limiter.check_key(&addr.ip()).is_err() {
                return Err(GatewayError::RateLimited);
            }
            req.headers_mut().insert(
                "x-forwarded-api-key",
                hval(key).map_err(|_| GatewayError::Unauthorized)?,
            );
        }
        AuthContext::Unauthenticated => {
            if state.ip_limiter.check_key(&addr.ip()).is_err() {
                return Err(GatewayError::RateLimited);
            }
        }
    }

    // Correlation ID
    let req_id = uuid::Uuid::new_v4().to_string();
    req.headers_mut().insert("x-request-id", hval(&req_id)?);

    Ok(next.run(req).await)
}

fn hval(s: &str) -> Result<HeaderValue, GatewayError> {
    HeaderValue::from_str(s).map_err(|_| GatewayError::BadGateway("invalid header value".into()))
}

/// Rejects non-HTTPS requests in production by checking `X-Forwarded-Proto`.
///
/// The gateway sits behind a TLS-terminating proxy (Cloudflare/nginx).
/// The proxy sets `X-Forwarded-Proto: https` for legitimate requests.
/// If the header is absent or not `https` in production, we return 403.
pub async fn enforce_https(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, GatewayError> {
    if state.config.is_production() {
        let proto = req
            .headers()
            .get("x-forwarded-proto")
            .and_then(|v| v.to_str().ok());
        if proto != Some("https") {
            return Err(GatewayError::HttpsRequired);
        }
    }
    Ok(next.run(req).await)
}

/// Injects security headers on every response.
pub async fn security_headers(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();

    let headers: &[(&str, &str)] = &[
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        ("referrer-policy", "strict-origin-when-cross-origin"),
        (
            "permissions-policy",
            "camera=(), microphone=(), geolocation=()",
        ),
        (
            "strict-transport-security",
            "max-age=31536000; includeSubDomains; preload",
        ),
        (
            "content-security-policy",
            "default-src 'self'; \
             script-src 'self' 'unsafe-inline'; \
             style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
             font-src 'self' https://fonts.gstatic.com; \
             img-src 'self' data: https:; \
             connect-src 'self'; \
             frame-ancestors 'none';",
        ),
    ];

    for (name, value) in headers {
        if let (Ok(n), Ok(v)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            h.insert(n, v);
        }
    }

    res
}
