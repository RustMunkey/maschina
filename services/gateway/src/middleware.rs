use std::net::SocketAddr;

use axum::{
    extract::{ConnectInfo, Request, State},
    http::HeaderValue,
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
