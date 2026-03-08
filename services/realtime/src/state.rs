use std::sync::Arc;

use crate::{config::Config, registry::Registry};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub registry: Registry,
    pub nats: async_nats::Client,
}
