use std::net::IpAddr;
use std::num::NonZeroU32;
use std::sync::Arc;

use governor::{clock::DefaultClock, state::keyed::DefaultKeyedStateStore, Quota, RateLimiter};

use crate::config::Config;

pub type IpLimiter = RateLimiter<IpAddr, DefaultKeyedStateStore<IpAddr>, DefaultClock>;
pub type UserLimiter = RateLimiter<String, DefaultKeyedStateStore<String>, DefaultClock>;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub http: reqwest::Client,
    /// Unauthenticated / API-key requests: 120 req/min per IP.
    pub ip_limiter: Arc<IpLimiter>,
    /// JWT-authenticated requests: 1 000 req/min per userId.
    pub user_limiter: Arc<UserLimiter>,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("failed to build http client");

        let ip_limiter = Arc::new(RateLimiter::keyed(Quota::per_minute(
            NonZeroU32::new(120).unwrap(),
        )));
        let user_limiter = Arc::new(RateLimiter::keyed(Quota::per_minute(
            NonZeroU32::new(1_000).unwrap(),
        )));

        Self {
            config: Arc::new(config),
            http,
            ip_limiter,
            user_limiter,
        }
    }
}
