use thiserror::Error;

#[derive(Debug, Error)]
pub enum MaschinaError {
    #[error("API error {status}: {message}")]
    Api {
        status: u16,
        message: String,
        code: Option<String>,
    },

    #[error("network error: {0}")]
    Network(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("unauthorized")]
    Unauthorized,

    #[error("rate limited")]
    RateLimited,

    #[error("internal error: {0}")]
    Internal(String),
}

impl MaschinaError {
    pub fn status(&self) -> Option<u16> {
        match self {
            MaschinaError::Api { status, .. } => Some(*status),
            MaschinaError::Unauthorized => Some(401),
            MaschinaError::RateLimited => Some(429),
            _ => None,
        }
    }
}
