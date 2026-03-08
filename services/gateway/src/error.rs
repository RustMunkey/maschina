use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GatewayError {
    #[error("unauthorized")]
    Unauthorized,

    #[error("rate limit exceeded")]
    RateLimited,

    #[error("bad gateway: {0}")]
    BadGateway(String),

    #[error("service unavailable")]
    ServiceUnavailable,
}

impl IntoResponse for GatewayError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            GatewayError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            GatewayError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate_limit_exceeded"),
            GatewayError::BadGateway(_) => (StatusCode::BAD_GATEWAY, "bad_gateway"),
            GatewayError::ServiceUnavailable => {
                (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
            }
        };
        let message = self.to_string();
        (status, Json(json!({ "error": code, "message": message }))).into_response()
    }
}
