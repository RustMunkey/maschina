use axum::http::HeaderMap;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

/// Claims embedded in access JWTs issued by `services/api`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// userId (UUID)
    pub sub: String,
    /// Plan tier key: "access" | "m1" | "m5" | "m10" | "teams" | "enterprise" | "internal"
    pub tier: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Clone)]
pub enum AuthContext {
    Jwt(Claims),
    /// Raw API key (begins with "msk_"); downstream API service validates + resolves user.
    ApiKey(String),
    Unauthenticated,
}

pub fn decode_jwt(token: &str, secret: &str) -> Option<Claims> {
    let key = DecodingKey::from_secret(secret.as_bytes());
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    decode::<Claims>(token, &key, &validation)
        .ok()
        .map(|d| d.claims)
}

/// Extract auth context from request headers.
/// Does NOT hit the database — JWT is validated stateless, API keys are forwarded.
pub fn extract_auth(headers: &HeaderMap, jwt_secret: &str) -> AuthContext {
    // Authorization: Bearer <token|api-key>
    if let Some(val) = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
    {
        if let Some(token) = val.strip_prefix("Bearer ") {
            if token.starts_with("msk_") {
                return AuthContext::ApiKey(token.to_string());
            }
            if let Some(claims) = decode_jwt(token, jwt_secret) {
                return AuthContext::Jwt(claims);
            }
            // Malformed / expired JWT — let it fall through as unauthenticated;
            // API service will reject with 401 on protected routes.
        }
    }

    // X-Api-Key: <key>
    if let Some(key) = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
    {
        return AuthContext::ApiKey(key.to_string());
    }

    AuthContext::Unauthenticated
}
