use axum::http::HeaderMap;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub tier: String,
    pub exp: usize,
    pub iat: usize,
}

/// Extract the authenticated userId for this connection.
///
/// Priority:
/// 1. `x-forwarded-user-id` — set by gateway after JWT validation (trusted path).
/// 2. `token` query parameter — fallback for direct connections (dev / SDK use).
///
/// Returns `None` if no valid identity can be resolved.
pub fn resolve_user_id(
    headers: &HeaderMap,
    token_param: Option<&str>,
    jwt_secret: &str,
) -> Option<String> {
    // Trusted forwarded header from gateway
    if let Some(uid) = headers
        .get("x-forwarded-user-id")
        .and_then(|v| v.to_str().ok())
    {
        if !uid.is_empty() {
            return Some(uid.to_string());
        }
    }

    // Direct JWT in query string (dev / native client)
    if let Some(token) = token_param {
        let key = DecodingKey::from_secret(jwt_secret.as_bytes());
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        if let Ok(data) = decode::<Claims>(token, &key, &validation) {
            return Some(data.claims.sub);
        }
    }

    None
}
